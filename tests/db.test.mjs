// Integration tests for the ticketing SQL. Run: npm run test:db (needs local Postgres, see tests/setup-local-db.sh)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const pool = new pg.Pool({ host: "/tmp", port: Number(process.env.PGTEST_PORT || 54329), user: "postgres", database: "aftr", max: 20 });
const q = async (sql, params) => (await pool.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const err = async (p) => { try { await p; } catch (e) { return e.message; } return null; };

let ev, ev2, typeA, typeB, staff, outsider, promoUser;
const items = (t, n) => JSON.stringify([{ ticket_type_id: t, quantity: n }]);
const order = (t, n, extra = {}) =>
  one(`select create_order($1,$2,$3,'Test Buyer',null,$4,$5,$6,'test','{}',$7,true) id`,
    [extra.event ?? ev, items(t, n), extra.email ?? `b${Math.random()}@x.com`, extra.user ?? null, extra.promo ?? null, extra.promoter ?? null, extra.key ?? null]).then((r) => r.id);
const pay = (id, amount, txn = `tx-${id}`) => one(`select confirm_payment($1,'sandbox',$2,$3,0,'{}') s`, [id, txn, amount]).then((r) => r.s);

before(async () => {
  const mk = async (slug, cap) => (await one(
    `insert into events (slug,title,starts_at,ends_at,capacity,status) values ($1,'T',now()+interval '7 days',now()+interval '8 days',$2,'on_sale') returning id`, [slug, cap])).id;
  ev = await mk("ev-one", 5);
  ev2 = await mk("ev-two", 100);
  typeA = (await one(`insert into ticket_types (event_id,name,price_cents,quantity,per_order_limit) values ($1,'Founders',1500,3,6) returning id`, [ev])).id;
  typeB = (await one(`insert into ticket_types (event_id,name,price_cents,quantity,per_order_limit) values ($1,'Wave 1',2000,10,6) returning id`, [ev])).id;
  staff = (await one(`insert into auth.users (email) values ('door@x.com') returning id`)).id;
  outsider = (await one(`insert into auth.users (email) values ('nobody@x.com') returning id`)).id;
  promoUser = (await one(`insert into auth.users (email) values ('promo@x.com') returning id`)).id;
  await q(`insert into user_roles (user_id, role, event_id) values ($1,'door_staff',$2)`, [staff, ev]);
});
after(() => pool.end());

test("price comes from DB and reservation holds inventory", async () => {
  const id = await order(typeA, 2);
  const o = await one(`select total_cents, status from orders where id=$1`, [id]);
  assert.equal(o.total_cents, 3000);
  assert.equal(o.status, "pending");
  const avail = await q(`select * from get_ticket_availability($1)`, [ev]);
  assert.equal(avail.find((a) => a.ticket_type_id === typeA).remaining, 1);
  await q(`update orders set expires_at = now() - interval '1 second' where id=$1`, [id]); // abandon it
  const after = await q(`select * from get_ticket_availability($1)`, [ev]);
  assert.equal(after.find((a) => a.ticket_type_id === typeA).remaining, 3);
});

test("simultaneous purchases for the last tickets never oversell", async () => {
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => order(typeA, 1)));
  const ok = results.filter((r) => r.status === "fulfilled").length;
  assert.equal(ok, 3);
  assert.ok(results.filter((r) => r.status === "rejected").every((r) => r.reason.message === "SOLD_OUT"));
  // event capacity (5) caps across types: 3 held on A, so only 2 more on B
  assert.equal(await err(order(typeB, 3)), "EVENT_CAPACITY");
  await q(`update orders set expires_at = now() - interval '1 second' where event_id=$1 and status='pending'`, [ev]);
});

test("per-order limit, wrong-event type and idempotency key", async () => {
  assert.equal(await err(order(typeB, 7)), "OVER_ORDER_LIMIT");
  assert.equal(await err(order(typeA, 1, { event: ev2 })), "TYPE_UNAVAILABLE");
  const a = await order(typeB, 1, { key: "idem-1" });
  const b = await order(typeB, 1, { key: "idem-1" });
  assert.equal(a, b);
  await q(`update orders set expires_at = now() - interval '1 second' where id=$1`, [a]);
});

test("payment issues tickets once; duplicate confirmation and amount forgery are safe", async () => {
  const id = await order(typeB, 2);
  assert.equal(await pay(id, 4000), "paid");
  assert.equal(await pay(id, 4000), "already_paid");
  assert.equal(await pay(id, 4000, "different-txn"), "already_paid");
  assert.equal((await one(`select count(*)::int n from tickets where order_id=$1`, [id])).n, 2);
  const forged = await order(typeB, 1);
  assert.equal(await pay(forged, 1), "refund_required");
  assert.equal((await one(`select count(*)::int n from tickets where order_id=$1`, [forged])).n, 0);
  await q(`select close_order($1,null,true)`, [forged]);
  await q(`select close_order($1,null,true)`, [id]);
});

test("failed payment releases inventory; late payment after expiry re-checks stock", async () => {
  const id = await order(typeB, 1);
  await q(`select fail_order($1,'declined')`, [id]);
  assert.equal((await one(`select status from orders where id=$1`, [id])).status, "failed");
  const late = await order(typeB, 1);
  await q(`update orders set expires_at = now() - interval '1 second' where id=$1`, [late]);
  assert.equal(await pay(late, 2000), "paid"); // still in stock
  await q(`select close_order($1,null,true)`, [late]);
});

test("scanning: admit once, reject duplicate, concurrent, wrong event, cancelled, unauthorized", async () => {
  const id = await order(typeB, 2);
  await pay(id, 4000);
  const [t1, t2] = (await q(`select id from tickets where order_id=$1 order by id`, [id])).map((r) => r.id);
  const scan = (t, e = ev, s = staff) => one(`select scan_ticket($1,$2,$3) r`, [t, e, s]).then((r) => r.r);

  const concurrent = await Promise.all(Array.from({ length: 8 }, () => scan(t1)));
  assert.equal(concurrent.filter((r) => r.result === "admitted").length, 1);
  assert.equal(concurrent.filter((r) => r.result === "already_used").length, 7);
  assert.equal((await scan(t1)).result, "already_used");
  assert.ok((await scan(t1)).checked_in_at);
  assert.equal(await err(scan(t2, ev2)), "FORBIDDEN"); // door staff only assigned to ev
  await q(`insert into user_roles (user_id, role, event_id) values ($1,'door_staff',$2)`, [staff, ev2]);
  assert.equal((await scan(t2, ev2)).result, "wrong_event");
  assert.equal(await err(scan(t2, ev, outsider)), "FORBIDDEN");
  assert.equal((await scan("00000000-0000-0000-0000-000000000000")).result, "invalid");

  await q(`select close_order($1,null,true)`, [id]);
  assert.equal((await scan(t2)).result, "cancelled");
  const statuses = (await q(`select status from tickets where order_id=$1 order by id`, [id])).map((r) => r.status);
  assert.deepEqual(statuses, ["used", "refunded"]);
});

test("promoter commission, refund reversal and self-dealing", async () => {
  const p = await one(`insert into promoters (user_id,name,code,commission_fixed_cents) values ($1,'Promo','PROMO1',200) returning id`, [promoUser]);
  await q(`insert into promo_codes (promoter_id, code, discount_type, discount_value, max_uses) values ($1,'SAVE10','percent',10,1)`, [p.id]);
  const id = await order(typeB, 2, { promo: "SAVE10" });
  const o = await one(`select total_cents, promoter_id from orders where id=$1`, [id]);
  assert.equal(o.total_cents, 3600);
  assert.equal(o.promoter_id, p.id);
  assert.equal(await err(order(typeB, 1, { promo: "SAVE10" })), "PROMO_EXHAUSTED");
  await pay(id, 3600);
  assert.equal((await one(`select amount_cents from commission_records where order_id=$1`, [id])).amount_cents, 400);
  await q(`select close_order($1,null,true)`, [id]);
  assert.equal((await one(`select status from commission_records where order_id=$1`, [id])).status, "reversed");

  const self = await order(typeB, 1, { promoter: "PROMO1", email: "promo@x.com" });
  assert.equal((await one(`select promoter_id from orders where id=$1`, [self])).promoter_id, null);
  await q(`update orders set expires_at = now() - interval '1 second' where id=$1`, [self]);
});

test("RLS: anon cannot read orders, tickets, waitlist, drafts or hidden venues", async () => {
  const c = await pool.connect();
  try {
    await c.query("begin; set local role anon");
    for (const t of ["orders", "tickets", "waitlist_entries", "payments", "promo_codes", "audit_logs", "rate_limits"]) {
      assert.equal((await c.query(`select count(*)::int n from ${t}`)).rows[0].n, 0, t);
    }
    await c.query("rollback");
    await q(`insert into events (slug,title,starts_at,ends_at,capacity) values ('secret','S',now(),now()+interval '1 hour',10)`);
    await q(`insert into event_venues (event_id, venue_name) values ($1,'Hidden Club')`, [ev]);
    await c.query("begin; set local role anon");
    assert.equal((await c.query(`select count(*)::int n from events where slug='secret'`)).rows[0].n, 0);
    assert.equal((await c.query(`select count(*)::int n from event_venues`)).rows[0].n, 0);
    assert.match(await err(c.query(`select scan_ticket(gen_random_uuid(), gen_random_uuid(), gen_random_uuid())`)), /permission denied/);
    await c.query("rollback");
    await c.query("begin; set local role anon");
    assert.match(await err(c.query(`insert into waitlist_entries (full_name,email,phone,age_confirmed,referral_code,access_token_hash) values ('x x','a@b.c','1',true,'X','h')`)), /permission denied|row-level security/);
    await c.query("rollback");
  } finally { c.release(); }
});

test("rate limiter", async () => {
  const r = [];
  for (let i = 0; i < 4; i++) r.push((await one(`select hit_rate_limit('k',3,60) ok`)).ok);
  assert.deepEqual(r, [true, true, true, false]);
});
