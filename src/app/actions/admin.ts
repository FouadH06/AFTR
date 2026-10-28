"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertRole, type Role } from "@/lib/auth";
import { toCents } from "@/lib/money";
import { sendTicketEmail } from "@/lib/orders";
import { getProvider } from "@/lib/payments";
import { supabaseAdmin } from "@/lib/supabase/server";
import { beirutToUtc } from "@/lib/time";

const db = () => supabaseAdmin();
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string) => str(fd, k) || null;
const httpsOrNull = (fd: FormData, k: string) => { const v = str(fd, k); if (!v) return null; if (!/^https:\/\//.test(v)) throw new Error(`${k} must start with https://`); return v; };
async function audit(actor: string, action: string, entity: string, id: string | null, data?: unknown) {
  await db().rpc("audit", { p_actor: actor, p_action: action, p_entity: entity, p_entity_id: id, p_data: data ?? null });
}
function check<T>(r: { error: { message: string } | null; data?: T | null }) { if (r.error) throw new Error(r.error.message); return r.data as T; }

// Events ------------------------------------------------------------------------
const TRANSITIONS: Record<string, string[]> = {
  draft: ["waitlist", "announced", "on_sale", "cancelled"],
  waitlist: ["draft", "announced", "on_sale", "cancelled"],
  announced: ["waitlist", "on_sale", "cancelled"],
  on_sale: ["announced", "sold_out", "completed", "cancelled"],
  sold_out: ["on_sale", "completed", "cancelled"],
  completed: [], cancelled: [],
};
const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

export async function saveEvent(fd: FormData) {
  const id = opt(fd, "id");
  const s = await assertRole(["event_manager"], id);
  const starts = beirutToUtc(str(fd, "starts_at")), ends = beirutToUtc(str(fd, "ends_at"));
  if (!starts || !ends) throw new Error("Start and end time are required");
  const status = str(fd, "status") || "draft";
  const row = {
    title: z.string().min(1).max(120).parse(str(fd, "title")),
    slug: slugify(str(fd, "slug") || str(fd, "title")),
    description: str(fd, "description"), starts_at: starts, ends_at: ends, area: opt(fd, "area"),
    venue_public: fd.get("venue_public") === "on", capacity: z.coerce.number().int().positive().parse(fd.get("capacity")),
    age_policy: str(fd, "age_policy") || "18+ with valid ID", dress_code: opt(fd, "dress_code"), artwork_url: httpsOrNull(fd, "artwork_url"),
    sales_start_at: beirutToUtc(str(fd, "sales_start_at")), sales_end_at: beirutToUtc(str(fd, "sales_end_at")),
    refund_policy: str(fd, "refund_policy") || "Tickets are non-refundable unless the event is cancelled.", rules: opt(fd, "rules"), recap: opt(fd, "recap"),
    lineup: lines(str(fd, "lineup")).map((l) => { const [name, note] = l.split("|").map((x) => x.trim()); return note ? { name, note } : { name }; }),
    faq: lines(str(fd, "faq")).map((l) => { const [q, a] = l.split("|").map((x) => x.trim()); return { q, a: a ?? "" }; }),
  };
  let eventId = id;
  if (id) {
    const { data: cur } = await db().from("events").select("status").eq("id", id).single();
    if (cur && cur.status !== status && !TRANSITIONS[cur.status]?.includes(status)) throw new Error(`Cannot move event from ${cur.status} to ${status}`);
    check(await db().from("events").update({ ...row, status }).eq("id", id));
  } else {
    if (!["draft", "waitlist"].includes(status)) throw new Error("New events start as draft or waitlist");
    eventId = check<{ id: string }>(await db().from("events").insert({ ...row, status }).select("id").single()).id;
  }
  check(await db().from("event_venues").upsert({ event_id: eventId, venue_name: opt(fd, "venue_name"), address: opt(fd, "venue_address"), map_url: httpsOrNull(fd, "map_url") }));
  await audit(s.user.id, id ? "event.updated" : "event.created", "event", eventId, { status });
  revalidatePath("/", "layout");
  redirect(`/admin/events/${eventId}?saved=1`);
}

export async function saveTicketType(fd: FormData) {
  const eventId = str(fd, "event_id"), id = opt(fd, "id");
  const s = await assertRole(["event_manager"], eventId);
  const quantity = z.coerce.number().int().positive().parse(fd.get("quantity"));
  if (id) {
    const { data: committed } = await db().rpc("committed_qty", { p_ticket_type: id });
    if (quantity < (committed ?? 0)) throw new Error(`Quantity can't go below ${committed} already sold/reserved`);
  }
  const row = {
    event_id: eventId, name: z.string().min(1).max(60).parse(str(fd, "name")), description: opt(fd, "description"),
    price_cents: toCents(fd.get("price")), quantity, per_order_limit: z.coerce.number().int().min(1).max(50).parse(fd.get("per_order_limit") || 6),
    sale_starts_at: beirutToUtc(str(fd, "sale_starts_at")), sale_ends_at: beirutToUtc(str(fd, "sale_ends_at")),
    visible: fd.get("visible") === "on", promo_eligible: fd.get("promo_eligible") === "on", sort_order: Number(fd.get("sort_order") || 0),
  };
  if (id) check(await db().from("ticket_types").update(row).eq("id", id).eq("event_id", eventId));
  else check(await db().from("ticket_types").insert(row));
  await audit(s.user.id, id ? "ticket_type.updated" : "ticket_type.created", "ticket_type", id, row);
  revalidatePath(`/admin/events/${eventId}`); revalidatePath("/", "layout");
}

export async function deleteTicketType(fd: FormData) {
  const eventId = str(fd, "event_id"), id = str(fd, "id");
  const s = await assertRole(["event_manager"], eventId);
  const { count } = await db().from("order_items").select("id", { count: "exact", head: true }).eq("ticket_type_id", id);
  if (count) check(await db().from("ticket_types").update({ visible: false }).eq("id", id)); // has orders: hide, never delete
  else check(await db().from("ticket_types").delete().eq("id", id).eq("event_id", eventId));
  await audit(s.user.id, count ? "ticket_type.hidden" : "ticket_type.deleted", "ticket_type", id);
  revalidatePath(`/admin/events/${eventId}`);
}

export async function saveExpense(fd: FormData) {
  const eventId = str(fd, "event_id"), id = opt(fd, "id");
  const s = await assertRole(["finance", "event_manager"], eventId);
  const row = { event_id: eventId, category: str(fd, "category"), description: opt(fd, "description"), budgeted_cents: toCents(fd.get("budgeted")), committed_cents: toCents(fd.get("committed")), paid_cents: toCents(fd.get("paid")) };
  if (id) check(await db().from("event_expenses").update(row).eq("id", id).eq("event_id", eventId));
  else check(await db().from("event_expenses").insert(row));
  await audit(s.user.id, "expense.saved", "event", eventId, row);
  revalidatePath(`/admin/events/${eventId}`);
}

export async function deleteExpense(fd: FormData) {
  const eventId = str(fd, "event_id");
  const s = await assertRole(["finance", "event_manager"], eventId);
  check(await db().from("event_expenses").delete().eq("id", str(fd, "id")).eq("event_id", eventId));
  await audit(s.user.id, "expense.deleted", "event", eventId, { id: str(fd, "id") });
  revalidatePath(`/admin/events/${eventId}`);
}

export async function savePromo(fd: FormData) {
  const eventId = opt(fd, "event_id");
  const s = await assertRole(["event_manager"], eventId);
  const type = str(fd, "discount_type");
  const row = {
    event_id: eventId, code: z.string().regex(/^[A-Za-z0-9_-]{3,24}$/, "Code: 3-24 letters/numbers").parse(str(fd, "code")).toUpperCase(),
    discount_type: type, discount_value: type === "percent" ? Math.min(100, Math.max(0, parseInt(str(fd, "discount_value")) || 0)) : toCents(fd.get("discount_value")),
    max_uses: parseInt(str(fd, "max_uses")) || null, promoter_id: opt(fd, "promoter_id"), active: true,
  };
  check(await db().from("promo_codes").insert(row));
  await audit(s.user.id, "promo.created", "promo_code", row.code, row);
  revalidatePath(`/admin/events/${eventId}`);
}

export async function togglePromo(fd: FormData) {
  const eventId = opt(fd, "event_id");
  const { data: promo } = await db().from("promo_codes").select("event_id").eq("id", str(fd, "id")).single();
  const s = await assertRole(["event_manager"], promo?.event_id ?? null); // global codes need a global manager
  check(await db().from("promo_codes").update({ active: fd.get("active") === "true" }).eq("id", str(fd, "id")));
  await audit(s.user.id, "promo.toggled", "promo_code", str(fd, "id"), { active: fd.get("active") });
  revalidatePath(`/admin/events/${eventId}`);
}

export async function cancelTestOrders(fd: FormData) {
  const eventId = str(fd, "event_id");
  const s = await assertRole(["event_manager"], eventId);
  const { data: orders } = await db().from("orders").select("id").eq("event_id", eventId).eq("is_test", true).in("status", ["paid", "pending", "refund_required"]);
  for (const o of orders ?? []) await db().rpc("close_order", { p_order: o.id, p_actor: s.user.id, p_refund: false });
  await audit(s.user.id, "event.test_orders_cancelled", "event", eventId, { count: orders?.length ?? 0 });
  revalidatePath(`/admin/events/${eventId}`);
}

// Orders ------------------------------------------------------------------------
async function orderFor(orderId: string, roles: Role[]) {
  const { data: o } = await db().from("orders").select("id, event_id, status, provider, total_cents").eq("id", orderId).single();
  if (!o) throw new Error("Order not found");
  return { o, s: await assertRole(roles, o.event_id) };
}

export async function refundOrder(fd: FormData) {
  const { o, s } = await orderFor(str(fd, "order_id"), ["finance", "event_manager"]);
  if (!["paid", "refund_required"].includes(o.status)) throw new Error("Only paid orders can be refunded");
  let txn: string | null = null;
  if (o.total_cents > 0 && o.provider && o.provider !== "free") {
    const p = getProvider(o.provider);
    if (!p) throw new Error("Unknown payment provider");
    txn = (await p.refund({ id: o.id })).txnId; // throws for unconfigured providers: refund via provider dashboard, then use "Mark refunded"
  }
  check(await db().rpc("close_order", { p_order: o.id, p_actor: s.user.id, p_refund: true, p_refund_txn: txn }));
  revalidatePath("/admin/orders");
}

/** Records a refund that was already performed outside the app (e.g. in the provider's merchant dashboard). */
export async function markRefunded(fd: FormData) {
  const { o, s } = await orderFor(str(fd, "order_id"), ["finance"]);
  check(await db().rpc("close_order", { p_order: o.id, p_actor: s.user.id, p_refund: true, p_refund_txn: `manual-${Date.now()}` }));
  revalidatePath("/admin/orders");
}

export async function cancelOrder(fd: FormData) {
  const { o, s } = await orderFor(str(fd, "order_id"), ["event_manager"]);
  check(await db().rpc("close_order", { p_order: o.id, p_actor: s.user.id, p_refund: false }));
  revalidatePath("/admin/orders");
}

export async function resendTickets(fd: FormData) {
  const { o, s } = await orderFor(str(fd, "order_id"), ["event_manager"]);
  await sendTicketEmail(o.id);
  await audit(s.user.id, "order.tickets_resent", "order", o.id);
}

// Waitlist ----------------------------------------------------------------------
export async function waitlistAction(fd: FormData) {
  const s = await assertRole(["event_manager"]);
  const id = str(fd, "id"), op = str(fd, "op");
  if (op === "verify") check(await db().from("waitlist_entries").update({ verified_at: new Date().toISOString(), verify_token_hash: null }).eq("id", id).is("verified_at", null));
  if (op === "flag" || op === "unflag") check(await db().from("waitlist_entries").update({ referral_flagged: op === "flag" }).eq("id", id));
  if (op === "approve" || op === "reject") {
    const threshold = Number(fd.get("threshold"));
    check(await db().from("reward_grants").upsert({ waitlist_entry_id: id, threshold, label: str(fd, "label"), status: op === "approve" ? "approved" : "rejected", decided_by: s.user.id }, { onConflict: "waitlist_entry_id,threshold" }));
  }
  await audit(s.user.id, `waitlist.${op}`, "waitlist_entry", id, Object.fromEntries(fd));
  revalidatePath("/admin/waitlist");
}

// Promoters ---------------------------------------------------------------------
export async function savePromoter(fd: FormData) {
  const s = await assertRole(["event_manager"]);
  const email = str(fd, "email").toLowerCase();
  let userId: string | null = null;
  if (email) {
    userId = (await db().rpc("find_user_id", { p_email: email })).data;
    if (!userId) throw new Error("No account with that email. Ask the promoter to create an account first.");
  }
  const row = {
    name: z.string().min(1).max(60).parse(str(fd, "name")), code: z.string().regex(/^[A-Za-z0-9_-]{3,24}$/).parse(str(fd, "code")).toUpperCase(),
    user_id: userId, commission_fixed_cents: toCents(fd.get("fixed")), commission_percent: Math.min(100, Math.max(0, Number(fd.get("percent") || 0))),
  };
  const id = opt(fd, "id");
  if (id) check(await db().from("promoters").update(row).eq("id", id)); else check(await db().from("promoters").insert(row));
  if (userId) await db().from("user_roles").upsert({ user_id: userId, role: "promoter", event_id: null }, { onConflict: "user_id,role,event_id", ignoreDuplicates: true });
  await audit(s.user.id, "promoter.saved", "promoter", id, row);
  revalidatePath("/admin/promoters");
}

export async function setCommission(fd: FormData) {
  const s = await assertRole(["finance"]);
  const status = z.enum(["approved", "paid", "pending"]).parse(str(fd, "status"));
  const ids = fd.getAll("ids").map(String);
  check(await db().from("commission_records").update({ status }).in("id", ids).neq("status", "reversed"));
  await audit(s.user.id, `commission.${status}`, "commission", null, { ids });
  revalidatePath("/admin/promoters");
}

// Team & settings ---------------------------------------------------------------
export async function grantRole(fd: FormData) {
  const s = await assertRole([]);
  const role = z.enum(["super_admin", "event_manager", "finance", "door_staff", "promoter"]).parse(str(fd, "role"));
  const userId = (await db().rpc("find_user_id", { p_email: str(fd, "email") })).data;
  if (!userId) throw new Error("No account with that email. They must create an account first.");
  check(await db().from("user_roles").upsert({ user_id: userId, role, event_id: opt(fd, "event_id") }, { onConflict: "user_id,role,event_id", ignoreDuplicates: true }));
  await audit(s.user.id, "role.granted", "user", userId, { role, event_id: opt(fd, "event_id") });
  revalidatePath("/admin/team");
}

export async function revokeRole(fd: FormData) {
  const s = await assertRole([]);
  const { data: r } = await db().from("user_roles").select("*").eq("id", str(fd, "id")).single();
  if (!r) return;
  if (r.user_id === s.user.id && r.role === "super_admin") throw new Error("You can't remove your own super admin role");
  check(await db().from("user_roles").delete().eq("id", r.id));
  await audit(s.user.id, "role.revoked", "user", r.user_id, { role: r.role, event_id: r.event_id });
  revalidatePath("/admin/team");
}

export async function saveBrand(fd: FormData) {
  const s = await assertRole([]);
  const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Colors must be hex like #C6FF35");
  let tiers: { threshold: number; label: string }[] = [];
  tiers = lines(str(fd, "referral_tiers")).map((l) => { const [t, label] = l.split("|").map((x) => x.trim()); return { threshold: z.coerce.number().int().positive().parse(t), label: label || `${t} referrals` }; });
  const row = {
    name: z.string().min(1).max(40).parse(str(fd, "name")), hero_headline: str(fd, "hero_headline") || "THE NIGHT IS LOADING.", tagline: str(fd, "tagline"),
    primary_color: color.parse(str(fd, "primary_color")), secondary_color: color.parse(str(fd, "secondary_color")),
    logo_url: httpsOrNull(fd, "logo_url"), instagram_url: httpsOrNull(fd, "instagram_url"), tiktok_url: httpsOrNull(fd, "tiktok_url"),
    contact_email: opt(fd, "contact_email"), launch_at: beirutToUtc(str(fd, "launch_at")), min_age: z.coerce.number().int().min(0).max(99).parse(fd.get("min_age")),
    processing_fee_pct: z.coerce.number().min(0).max(100).parse(fd.get("processing_fee_pct") || 0), referral_tiers: tiers.sort((a, b) => a.threshold - b.threshold),
  };
  check(await db().from("brand_settings").update(row).eq("id", 1));
  await audit(s.user.id, "brand.updated", "brand_settings", "1", row);
  revalidatePath("/", "layout");
}
