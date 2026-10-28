import { CopyButton } from "@/components/client";
import { SetupRequired, Stat, StatusBadge } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { env, isConfigured } from "@/lib/env";
import { usd } from "@/lib/money";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Promoter", robots: { index: false } };

export default async function PromoterPage() {
  if (!isConfigured()) return <SetupRequired />;
  const s = await requireRole(["promoter"], null, "/promoter");
  const db = supabaseAdmin();
  const { data: p } = await db.from("promoters").select("*").eq("user_id", s.user.id).maybeSingle();
  if (!p) return <p className="p-6 text-muted">Your account isn&apos;t linked to a promoter profile yet. Ask an admin.</p>;
  // Only aggregate data about this promoter's own sales — never attendee details.
  const [{ data: orders }, { data: commissions }, { data: codes }] = await Promise.all([
    db.from("orders").select("id, total_cents, paid_at, events(title, starts_at), order_items(quantity)").eq("promoter_id", p.id).eq("status", "paid").eq("is_test", false),
    db.from("commission_records").select("amount_cents, status, created_at").eq("promoter_id", p.id),
    db.from("promo_codes").select("code, discount_type, discount_value, active").eq("promoter_id", p.id),
  ]);
  const tickets = (orders ?? []).reduce((n, o) => n + (o.order_items as { quantity: number }[]).reduce((a, i) => a + i.quantity, 0), 0);
  const revenue = (orders ?? []).reduce((n, o) => n + o.total_cents, 0);
  const sum = (st: string) => (commissions ?? []).filter((c) => c.status === st).reduce((n, c) => n + c.amount_cents, 0);
  const byEvent = new Map<string, { title: string; date: string; tickets: number; revenue: number }>();
  for (const o of orders ?? []) {
    const ev = o.events as unknown as { title: string; starts_at: string };
    const row = byEvent.get(ev.title) ?? { title: ev.title, date: ev.starts_at, tickets: 0, revenue: 0 };
    row.tickets += (o.order_items as { quantity: number }[]).reduce((a, i) => a + i.quantity, 0); row.revenue += o.total_cents;
    byEvent.set(ev.title, row);
  }
  const link = `${env.siteUrl}/?p=${p.code}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div><p className="text-xs uppercase tracking-[0.3em] text-accent">Promoter</p><h1 className="h-display mt-1 text-3xl">{p.name}</h1></div>
      <div className="card space-y-2">
        <div className="label">Your link</div><code className="block break-all rounded-lg bg-surface-2 p-3 text-sm">{link}</code><CopyButton text={link} />
        {codes?.length ? <p className="text-sm text-muted">Promo codes: {codes.map((c) => `${c.code} (${c.discount_type === "percent" ? `${c.discount_value}%` : usd(c.discount_value)} off${c.active ? "" : ", inactive"})`).join(", ")}</p> : null}
        <p className="text-xs text-muted">Commission: {p.commission_fixed_cents ? `${usd(p.commission_fixed_cents)}/ticket` : ""}{p.commission_fixed_cents && Number(p.commission_percent) ? " + " : ""}{Number(p.commission_percent) ? `${p.commission_percent}% of order` : ""}. Only paid, non-refunded sales count. You can&apos;t earn on your own purchases.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Tickets sold" value={tickets} /><Stat label="Attributed revenue" value={usd(revenue)} />
        <Stat label="Pending commission" value={usd(sum("pending"))} /><Stat label="Approved / paid" value={usd(sum("approved") + sum("paid"))} sub={`${usd(sum("paid"))} paid out`} />
      </div>
      <div className="card overflow-x-auto"><div className="label mb-2">Performance by event</div>
        <table className="table"><thead><tr><th>Event</th><th>Date</th><th>Tickets</th><th>Revenue</th></tr></thead>
          <tbody>{[...byEvent.values()].map((r) => <tr key={r.title}><td>{r.title}</td><td>{fmtDate(r.date)}</td><td>{r.tickets}</td><td>{usd(r.revenue)}</td></tr>)}</tbody></table>
      </div>
      <div className="card"><div className="label mb-2">Commission history</div>
        <ul className="space-y-1 text-sm">{(commissions ?? []).map((c, i) => <li key={i} className="flex justify-between"><span>{fmtDate(c.created_at)}</span><span className="flex gap-2">{usd(c.amount_cents)} <StatusBadge s={c.status} /></span></li>)}</ul>
      </div>
    </div>
  );
}
