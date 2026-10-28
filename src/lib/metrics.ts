import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { beirutDay } from "@/lib/time";

type Item = { quantity: number; unit_price_cents: number; ticket_type_id: string };
type Order = { id: string; status: string; total_cents: number; paid_at: string | null; source: string | null; utm: Record<string, string>; promoter_id: string | null; is_test: boolean; order_items: Item[] };

export async function eventMetrics(eventId: string, includeTest: boolean, feePct: number) {
  const db = supabaseAdmin();
  const [{ data: ev }, { data: types }, { data: ordersRaw }, { data: expenses }, { data: committed }, { data: promoters }] = await Promise.all([
    db.from("events").select("id, title, capacity, starts_at, status").eq("id", eventId).single(),
    db.from("ticket_types").select("id, name, price_cents, quantity").eq("event_id", eventId).order("sort_order"),
    db.from("orders").select("id, status, total_cents, paid_at, source, utm, promoter_id, is_test, order_items(quantity, unit_price_cents, ticket_type_id)")
      .eq("event_id", eventId).in("status", ["paid", "refunded", "pending", "refund_required"]),
    db.from("event_expenses").select("*").eq("event_id", eventId).order("created_at"),
    db.rpc("event_committed_qty", { p_event: eventId }),
    db.from("promoters").select("id, name"),
  ]);
  const orders = ((ordersRaw ?? []) as Order[]).filter((o) => includeTest || !o.is_test);
  const ids = orders.map((o) => o.id);
  const [{ data: payments }, { data: commissions }, { count: checkedIn }] = await Promise.all([
    ids.length ? db.from("payments").select("order_id, kind, fee_cents, amount_cents").in("order_id", ids) : Promise.resolve({ data: [] as { order_id: string; kind: string; fee_cents: number; amount_cents: number }[] }),
    ids.length ? db.from("commission_records").select("amount_cents, status, promoter_id").in("order_id", ids) : Promise.resolve({ data: [] as { amount_cents: number; status: string; promoter_id: string }[] }),
    db.from("tickets").select("id, orders!inner(is_test)", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "used").in("orders.is_test", includeTest ? [true, false] : [false]),
  ]);

  const qty = (o: Order) => o.order_items.reduce((n, i) => n + i.quantity, 0);
  const paid = orders.filter((o) => o.status === "paid"), refunded = orders.filter((o) => o.status === "refunded");
  const sold = [...paid, ...refunded];
  const gross = sold.reduce((n, o) => n + o.total_cents, 0);
  const refunds = refunded.reduce((n, o) => n + o.total_cents, 0);
  const fees = (payments ?? []).filter((p) => p.kind === "charge").reduce((n, p) => n + p.fee_cents, 0);
  const net = gross - refunds - fees;
  const paidTickets = paid.reduce((n, o) => n + qty(o), 0);
  const today = beirutDay(new Date().toISOString());
  const soldToday = paid.filter((o) => o.paid_at && beirutDay(o.paid_at) === today).reduce((n, o) => n + qty(o), 0);
  const capacity = ev?.capacity ?? 0;

  const byWave = (types ?? []).map((t) => {
    const items = paid.flatMap((o) => o.order_items.filter((i) => i.ticket_type_id === t.id));
    return { label: t.name, sold: items.reduce((n, i) => n + i.quantity, 0), quantity: t.quantity, revenue: items.reduce((n, i) => n + i.quantity * i.unit_price_cents, 0) };
  });
  const days: { label: string; value: number }[] = [];
  for (let d = 13; d >= 0; d--) {
    const key = beirutDay(new Date(Date.now() - d * 86400000).toISOString());
    days.push({ label: key.slice(5), value: paid.filter((o) => o.paid_at && beirutDay(o.paid_at) === key).reduce((n, o) => n + qty(o), 0) });
  }
  const group = (key: (o: Order) => string) => {
    const m = new Map<string, number>();
    for (const o of paid) m.set(key(o), (m.get(key(o)) ?? 0) + qty(o));
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };
  const promoterName = new Map((promoters ?? []).map((p) => [p.id, p.name]));
  const bySource = group((o) => o.utm?.utm_source || o.source || (o.promoter_id ? "promoter" : "direct"));
  const byPromoter = group((o) => (o.promoter_id ? promoterName.get(o.promoter_id) ?? "?" : "")).filter((x) => x.label);

  const commissionLive = (commissions ?? []).filter((c) => c.status !== "reversed").reduce((n, c) => n + c.amount_cents, 0);
  const commissionPaid = (commissions ?? []).filter((c) => c.status === "paid").reduce((n, c) => n + c.amount_cents, 0);
  const exp = expenses ?? [];
  const budgeted = exp.reduce((n, e) => n + e.budgeted_cents, 0), committedExp = exp.reduce((n, e) => n + e.committed_cents, 0), paidExp = exp.reduce((n, e) => n + e.paid_cents, 0);
  const expected = exp.reduce((n, e) => n + Math.max(e.budgeted_cents, e.committed_cents, e.paid_cents), 0) + commissionLive;

  const listRevenue = (types ?? []).reduce((n, t) => n + t.price_cents * t.quantity, 0);
  const listQty = (types ?? []).reduce((n, t) => n + t.quantity, 0);
  const avgPrice = paidTickets ? Math.round(paid.reduce((n, o) => n + o.total_cents, 0) / paidTickets) : listQty ? Math.round(listRevenue / listQty) : 0;
  const avgNet = avgPrice * (1 - feePct / 100);
  const sellable = Math.min(capacity, listQty);
  const projectedRevenue = Math.round((listQty ? (listRevenue * sellable) / listQty : 0) * (1 - feePct / 100));

  return {
    event: ev, types: types ?? [], expenses: exp, byWave, days, bySource, byPromoter,
    gross, refunds, fees, net, paidTickets, soldToday, capacity, checkedIn: checkedIn ?? 0,
    available: Math.max(0, capacity - (committed ?? 0)), pendingHeld: Math.max(0, (committed ?? 0) - paidTickets),
    sellThrough: capacity ? paidTickets / capacity : 0, avgPrice,
    budgeted, committedExp, paidExp, expected, commissionLive, commissionPaid,
    breakEven: avgNet > 0 ? Math.ceil(expected / avgNet) : null,
    projectedRevenue, projectedProfit: projectedRevenue - expected,
    confirmedProfit: net - expected, settledProfit: net - paidExp - commissionPaid,
    testOrders: ((ordersRaw ?? []) as Order[]).filter((o) => o.is_test && o.status === "paid").length,
  };
}
