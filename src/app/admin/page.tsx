import Link from "next/link";
import { Bars, Notice, Stat } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getBrand } from "@/lib/brand";
import { eventMetrics } from "@/lib/metrics";
import { usd } from "@/lib/money";
import { fmtDate } from "@/lib/time";
import { EventSelect } from "./EventSelect";
import { pickEvent } from "./lib";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ event?: string; test?: string }> }) {
  const sp = await searchParams;
  const s = await requireRole(["event_manager", "finance"]);
  const { events, event } = await pickEvent(s, sp.event);
  if (!event) return <div className="space-y-4"><h1 className="h-display text-2xl">Dashboard</h1><p className="text-muted">No events yet. <Link className="text-accent underline" href="/admin/events">Create your first event</Link>.</p></div>;
  const brand = await getBrand();
  const includeTest = sp.test === "1";
  const m = await eventMetrics(event.id, includeTest, brand.processing_fee_pct);
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="h-display text-2xl">{event.title}</h1><p className="text-sm text-muted">{fmtDate(event.starts_at)} · {event.status.replace("_", " ")}</p></div>
        <div className="flex items-center gap-2"><EventSelect events={events} current={event.id} />
          <Link className="btn-ghost btn-sm" href={`?event=${event.id}${includeTest ? "" : "&test=1"}`}>{includeTest ? "Hide" : "Include"} sandbox</Link></div>
      </div>
      {includeTest ? <Notice>Including SANDBOX test orders — these figures are not real revenue.</Notice>
        : m.testOrders > 0 && <Notice tone="info">{m.testOrders} paid sandbox test order(s) are excluded. Cancel them before the event (Events → this event).</Notice>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Gross ticket sales" value={usd(m.gross)} sub={`Refunds −${usd(m.refunds)} · fees −${usd(m.fees)}`} />
        <Stat label="Net revenue (confirmed)" value={usd(m.net)} />
        <Stat label="Paid tickets" value={m.paidTickets} sub={`${m.soldToday} today · ${m.pendingHeld} held in checkout`} />
        <Stat label="Sell-through" value={pct(m.sellThrough)} sub={`${m.available} of ${m.capacity} still available`} />
        <Stat label="Avg ticket price" value={usd(m.avgPrice)} />
        <Stat label="Checked in" value={m.checkedIn} sub={m.paidTickets ? `${pct(m.checkedIn / m.paidTickets)} of paid` : undefined} />
        <Stat label="Break-even" value={m.breakEven === null ? "—" : `${m.breakEven} tickets`} sub={m.breakEven ? `${Math.max(0, m.breakEven - m.paidTickets)} more to go` : "Add expenses + prices"} />
        <Stat label="Projected profit" value={usd(m.projectedProfit)} sub="Estimate: all inventory sells at list price" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card"><div className="label mb-3">Tickets sold — last 14 days</div><Bars data={m.days} /></div>
        <div className="card"><div className="label mb-3">Sales by wave</div>
          <Bars data={m.byWave.map((w) => ({ label: w.label, value: w.sold }))} format={(n) => String(n)} />
          <table className="table mt-4"><thead><tr><th>Wave</th><th>Sold</th><th>Revenue</th></tr></thead>
            <tbody>{m.byWave.map((w) => <tr key={w.label}><td>{w.label}</td><td>{w.sold}/{w.quantity}</td><td>{usd(w.revenue)}</td></tr>)}</tbody></table>
        </div>
        <div className="card"><div className="label mb-3">Source attribution (tickets)</div><Bars data={m.bySource} /></div>
        <div className="card"><div className="label mb-3">Promoter performance (tickets)</div><Bars data={m.byPromoter} /></div>
      </div>

      <div className="card overflow-x-auto">
        <div className="label mb-3">Profitability</div>
        <table className="table"><tbody>
          <tr><td>Projected net revenue <span className="text-muted">(estimate, after {brand.processing_fee_pct}% fees)</span></td><td className="text-right">{usd(m.projectedRevenue)}</td></tr>
          <tr><td>Confirmed net revenue <span className="text-muted">(paid − refunds − fees)</span></td><td className="text-right">{usd(m.net)}</td></tr>
          <tr><td>Expenses: budgeted / committed / paid</td><td className="text-right">{usd(m.budgeted)} / {usd(m.committedExp)} / {usd(m.paidExp)}</td></tr>
          <tr><td>Promoter commissions (live / paid)</td><td className="text-right">{usd(m.commissionLive)} / {usd(m.commissionPaid)}</td></tr>
          <tr><td>Expected total cost <span className="text-muted">(max of budget/committed/paid per line + commissions)</span></td><td className="text-right">{usd(m.expected)}</td></tr>
          <tr><td className="font-semibold">Projected profit <span className="font-normal text-muted">(estimate)</span></td><td className="text-right font-semibold">{usd(m.projectedProfit)}</td></tr>
          <tr><td className="font-semibold">Profit on confirmed sales vs expected cost</td><td className="text-right font-semibold">{usd(m.confirmedProfit)}</td></tr>
          <tr><td className="font-semibold">Settled to date <span className="font-normal text-muted">(net revenue − expenses actually paid)</span></td><td className="text-right font-semibold">{usd(m.settledProfit)}</td></tr>
        </tbody></table>
        <Link href={`/admin/events/${event.id}#expenses`} className="btn-ghost btn-sm mt-3">Edit expenses</Link>
      </div>
    </div>
  );
}
