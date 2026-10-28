import Link from "next/link";
import { cancelOrder, markRefunded, refundOrder, resendTickets } from "@/app/actions/admin";
import { admitById } from "@/app/actions/staff";
import { ConfirmButton, SubmitButton } from "@/components/client";
import { StatusBadge } from "@/components/ui";
import { can, requireRole } from "@/lib/auth";
import { usd } from "@/lib/money";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/time";
import { EventSelect } from "../EventSelect";
import { pickEvent } from "../lib";

const PAGE = 25;
const STATUSES = ["", "paid", "pending", "failed", "refunded", "cancelled", "expired", "refund_required"];

export default async function Orders({ searchParams }: { searchParams: Promise<{ event?: string; q?: string; status?: string; page?: string }> }) {
  const sp = await searchParams;
  const s = await requireRole(["event_manager", "finance"]);
  const { events, event } = await pickEvent(s, sp.event);
  if (!event) return <p className="text-muted">No events.</p>;
  const page = Math.max(1, Number(sp.page) || 1);
  let q = supabaseAdmin().from("orders").select("*, order_items(quantity, ticket_types(name)), tickets(id, status, checked_in_at), promoters(name)", { count: "exact" })
    .eq("event_id", event.id).order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (sp.status) q = q.eq("status", sp.status);
  const term = (sp.q ?? "").trim().replace(/[%,()*"\\]/g, "");
  if (term) q = q.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  const { data: orders, count } = await q;
  const finance = can(s, ["finance"], event.id), manager = can(s, ["event_manager"], event.id), door = can(s, ["door_staff", "event_manager"], event.id);
  const qs = (p: number) => `?${new URLSearchParams({ event: event.id, q: sp.q ?? "", status: sp.status ?? "", page: String(p) })}`;

  async function admit(fd: FormData) { "use server"; await admitById(String(fd.get("event_id")), String(fd.get("ticket_id"))); }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h-display text-2xl">Orders</h1>
        <div className="flex gap-2"><EventSelect events={events} current={event.id} /><a className="btn-ghost btn-sm" href={`/api/export/orders?event=${event.id}`}>Export CSV</a></div>
      </div>
      <form className="flex flex-wrap gap-2">
        <input type="hidden" name="event" value={event.id} />
        <input className="input max-w-xs" name="q" defaultValue={sp.q} placeholder="Search name, email, phone" />
        <select name="status" defaultValue={sp.status ?? ""} className="input max-w-44">{STATUSES.map((x) => <option key={x} value={x}>{x || "All statuses"}</option>)}</select>
        <button className="btn-ghost btn-sm">Filter</button>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="table"><thead><tr><th>Buyer</th><th>Items</th><th>Total</th><th>Status</th><th>Tickets</th><th>Source</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>{(orders ?? []).map((o) => {
            const items = o.order_items as { quantity: number; ticket_types: { name: string } }[];
            const tickets = o.tickets as { id: string; status: string; checked_in_at: string | null }[];
            return (
              <tr key={o.id}>
                <td><div className="font-medium">{o.full_name}{o.is_test && <span className="badge ml-1 text-warn">test</span>}</div><div className="text-xs text-muted">{o.email}<br />{o.phone}</div></td>
                <td className="text-xs">{items.map((i) => `${i.quantity}× ${i.ticket_types.name}`).join(", ")}</td>
                <td>{usd(o.total_cents)}{o.discount_cents > 0 && <div className="text-xs text-muted">−{usd(o.discount_cents)}</div>}</td>
                <td><StatusBadge s={o.status} />{o.note && <div className="text-xs text-muted">{o.note}</div>}</td>
                <td className="space-y-1 text-xs">{tickets.map((t) => (
                  <div key={t.id} className="flex items-center gap-1"><StatusBadge s={t.status} />
                    {t.status === "valid" && door && o.status === "paid" && <form action={admit}><input type="hidden" name="event_id" value={event.id} /><input type="hidden" name="ticket_id" value={t.id} /><ConfirmButton className="btn-ghost btn-sm" message="Manually check in this ticket? Confirm ID first.">Check in</ConfirmButton></form>}
                  </div>))}</td>
                <td className="text-xs">{(o.promoters as { name: string } | null)?.name ?? o.utm?.utm_source ?? o.source ?? "direct"}</td>
                <td className="text-xs text-muted">{fmtDateTime(o.created_at)}</td>
                <td className="space-y-1">
                  {(o.status === "paid" || o.status === "refund_required") && (finance || manager) && <form action={refundOrder}><input type="hidden" name="order_id" value={o.id} /><ConfirmButton message={`Refund ${usd(o.total_cents)} to ${o.full_name}? Tickets will be invalidated.`}>Refund</ConfirmButton></form>}
                  {(o.status === "paid" || o.status === "refund_required") && finance && o.provider !== "sandbox" && <form action={markRefunded}><input type="hidden" name="order_id" value={o.id} /><ConfirmButton className="btn-ghost btn-sm" message="Only use this if you ALREADY refunded via the provider dashboard. Continue?">Mark refunded</ConfirmButton></form>}
                  {["paid", "pending"].includes(o.status) && manager && <form action={cancelOrder}><input type="hidden" name="order_id" value={o.id} /><ConfirmButton className="btn-ghost btn-sm" message="Cancel this order without refund? Tickets will be invalidated.">Cancel</ConfirmButton></form>}
                  {o.status === "paid" && manager && <form action={resendTickets}><input type="hidden" name="order_id" value={o.id} /><SubmitButton className="btn-ghost btn-sm">Resend email</SubmitButton></form>}
                </td>
              </tr>
            );
          })}</tbody></table>
        {!orders?.length && <p className="p-4 text-sm text-muted">No orders match.</p>}
      </div>
      <div className="flex items-center gap-3 text-sm text-muted">
        {page > 1 && <Link className="btn-ghost btn-sm" href={qs(page - 1)}>← Prev</Link>}
        <span>Page {page} · {count ?? 0} orders</span>
        {page * PAGE < (count ?? 0) && <Link className="btn-ghost btn-sm" href={qs(page + 1)}>Next →</Link>}
      </div>
    </div>
  );
}
