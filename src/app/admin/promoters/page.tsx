import { savePromoter, setCommission } from "@/app/actions/admin";
import { SubmitButton } from "@/components/client";
import { Field, StatusBadge } from "@/components/ui";
import { can, requireRole } from "@/lib/auth";
import { usd } from "@/lib/money";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/time";

export default async function Promoters() {
  const s = await requireRole(["event_manager", "finance"]);
  const db = supabaseAdmin();
  const [{ data: promoters }, { data: commissions }] = await Promise.all([
    db.from("promoters").select("*").order("created_at"),
    db.from("commission_records").select("id, promoter_id, amount_cents, status, created_at, orders(total_cents, events(title))").order("created_at", { ascending: false }).limit(200),
  ]);
  const finance = can(s, ["finance"]), manager = can(s, ["event_manager"]);
  const sum = (pid: string, st: string[]) => (commissions ?? []).filter((c) => c.promoter_id === pid && st.includes(c.status)).reduce((n, c) => n + c.amount_cents, 0);

  return (
    <div className="space-y-6">
      <h1 className="h-display text-2xl">Promoters</h1>
      <div className="card overflow-x-auto p-0">
        <table className="table"><thead><tr><th>Name</th><th>Code</th><th>Commission</th><th>Pending</th><th>Approved</th><th>Paid</th><th>Linked account</th></tr></thead>
          <tbody>{(promoters ?? []).map((p) => (
            <tr key={p.id}><td className="font-medium">{p.name}</td><td className="font-mono">{p.code}</td>
              <td className="text-xs">{usd(p.commission_fixed_cents)}/ticket + {p.commission_percent}%</td>
              <td>{usd(sum(p.id, ["pending"]))}</td><td>{usd(sum(p.id, ["approved"]))}</td><td>{usd(sum(p.id, ["paid"]))}</td><td className="text-xs">{p.user_id ? "yes" : "no"}</td></tr>
          ))}</tbody></table>
      </div>
      {manager && (
        <form action={savePromoter} className="card grid max-w-3xl gap-3 sm:grid-cols-3">
          <h2 className="h-display text-lg sm:col-span-3">Add promoter</h2>
          <Field label="Name" name="name" required /><Field label="Code / link slug" name="code" required placeholder="MAYA" />
          <Field label="Account email (optional)" name="email" type="email" hint="Gives them the promoter dashboard" />
          <Field label="Fixed $ per ticket" name="fixed" type="number" step="0.01" min="0" defaultValue="0" />
          <Field label="% of order" name="percent" type="number" step="0.5" min="0" max="100" defaultValue="0" />
          <div className="self-end"><SubmitButton>Save promoter</SubmitButton></div>
        </form>
      )}
      <form action={setCommission} className="card space-y-3 overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="h-display text-lg">Commission records</h2>
          {finance && <div className="flex gap-2"><select name="status" className="input py-1.5"><option value="approved">Approve selected</option><option value="paid">Mark selected paid</option></select><SubmitButton className="btn-ghost btn-sm">Apply</SubmitButton></div>}
        </div>
        <table className="table"><thead><tr><th></th><th>Promoter</th><th>Event</th><th>Order total</th><th>Commission</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>{(commissions ?? []).map((c) => {
            const o = c.orders as unknown as { total_cents: number; events: { title: string } };
            return <tr key={c.id}><td>{finance && c.status !== "reversed" && c.status !== "paid" && <input type="checkbox" name="ids" value={c.id} />}</td>
              <td>{promoters?.find((p) => p.id === c.promoter_id)?.name}</td><td>{o.events.title}</td><td>{usd(o.total_cents)}</td><td>{usd(c.amount_cents)}</td><td><StatusBadge s={c.status} /></td><td className="text-xs">{fmtDate(c.created_at)}</td></tr>;
          })}</tbody></table>
        <p className="text-xs text-muted">Commissions are created only for confirmed paid orders, reversed automatically on refund/cancel, and never earned on a promoter&apos;s own purchase.</p>
      </form>
    </div>
  );
}
