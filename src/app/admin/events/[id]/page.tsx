import { notFound } from "next/navigation";
import { cancelTestOrders, deleteExpense, deleteTicketType, saveEvent, saveExpense, savePromo, saveTicketType, togglePromo } from "@/app/actions/admin";
import { ConfirmButton, SubmitButton } from "@/components/client";
import { Field, Notice, StatusBadge, TextArea } from "@/components/ui";
import { can, requireRole } from "@/lib/auth";
import { usd } from "@/lib/money";
import { supabaseAdmin } from "@/lib/supabase/server";
import { utcToBeirutInput } from "@/lib/time";

const STATUSES = ["draft", "waitlist", "announced", "on_sale", "sold_out", "completed", "cancelled"];
const CATEGORIES = ["venue", "djs", "sound", "lighting", "security", "photography", "marketing", "staff", "misc"];
const money = (c: number) => (c / 100).toFixed(2);

export default async function EventAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const s = await requireRole(["event_manager", "finance"], id);
  const db = supabaseAdmin();
  const [{ data: e }, { data: venue }, { data: types }, { data: expenses }, { data: promos }, { data: promoters }, { data: avail }] = await Promise.all([
    db.from("events").select("*").eq("id", id).maybeSingle(),
    db.from("event_venues").select("*").eq("event_id", id).maybeSingle(),
    db.from("ticket_types").select("*").eq("event_id", id).order("sort_order").order("price_cents"),
    db.from("event_expenses").select("*").eq("event_id", id).order("created_at"),
    db.from("promo_codes").select("*, promoters(name)").or(`event_id.eq.${id},event_id.is.null`).order("created_at"),
    db.from("promoters").select("id, name").eq("active", true),
    db.rpc("get_ticket_availability", { p_event: id }),
  ]);
  if (!e) notFound();
  const manage = can(s, ["event_manager"], id);
  const remaining = new Map<string, number>((avail ?? []).map((a: { ticket_type_id: string; remaining: number }) => [a.ticket_type_id, a.remaining]));
  const typeQty = (types ?? []).reduce((n, t) => n + t.quantity, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3"><h1 className="h-display text-2xl">{e.title}</h1><StatusBadge s={e.status} /></div>
      {saved && <Notice tone="ok">Saved.</Notice>}
      {typeQty > e.capacity && <Notice>Ticket type quantities ({typeQty}) exceed event capacity ({e.capacity}). Capacity is enforced across all types.</Notice>}

      {manage && (
        <form action={saveEvent} className="card grid gap-3 md:grid-cols-2">
          <input type="hidden" name="id" value={e.id} />
          <h2 className="h-display text-lg md:col-span-2">Details</h2>
          <Field label="Title" name="title" defaultValue={e.title} required />
          <Field label="Slug (URL)" name="slug" defaultValue={e.slug} />
          <label className="block"><span className="label">Status</span>
            <select name="status" defaultValue={e.status} className="input">{STATUSES.map((x) => <option key={x} value={x}>{x.replace("_", " ")}</option>)}</select></label>
          <Field label="Capacity" name="capacity" type="number" min={1} defaultValue={e.capacity} required />
          <Field label="Starts (Beirut)" name="starts_at" type="datetime-local" defaultValue={utcToBeirutInput(e.starts_at)} required />
          <Field label="Ends (Beirut)" name="ends_at" type="datetime-local" defaultValue={utcToBeirutInput(e.ends_at)} required />
          <Field label="Sales open (Beirut, optional)" name="sales_start_at" type="datetime-local" defaultValue={utcToBeirutInput(e.sales_start_at)} />
          <Field label="Sales close (Beirut, optional)" name="sales_end_at" type="datetime-local" defaultValue={utcToBeirutInput(e.sales_end_at)} />
          <Field label="Public area" name="area" defaultValue={e.area} hint="Shown while the venue is hidden" />
          <Field label="Artwork URL (https)" name="artwork_url" defaultValue={e.artwork_url} />
          <Field label="Venue name" name="venue_name" defaultValue={venue?.venue_name} />
          <Field label="Venue address" name="venue_address" defaultValue={venue?.address} />
          <Field label="Map URL (https)" name="map_url" defaultValue={venue?.map_url} />
          <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" name="venue_public" defaultChecked={e.venue_public} /> Reveal venue publicly</label>
          <Field label="Age policy" name="age_policy" defaultValue={e.age_policy} />
          <Field label="Dress code" name="dress_code" defaultValue={e.dress_code} />
          <div className="md:col-span-2"><TextArea label="Description" name="description" defaultValue={e.description} rows={4} /></div>
          <TextArea label="Lineup (one per line: Name | note)" name="lineup" defaultValue={(e.lineup as { name: string; note?: string }[]).map((a) => a.note ? `${a.name} | ${a.note}` : a.name).join("\n")} />
          <TextArea label="FAQ (one per line: Question | Answer)" name="faq" defaultValue={(e.faq as { q: string; a: string }[]).map((f) => `${f.q} | ${f.a}`).join("\n")} />
          <TextArea label="Rules" name="rules" defaultValue={e.rules} />
          <TextArea label="Refund / cancellation policy" name="refund_policy" defaultValue={e.refund_policy} />
          <div className="md:col-span-2"><TextArea label="Recap (shown in archive once completed)" name="recap" defaultValue={e.recap} /></div>
          <div className="md:col-span-2"><SubmitButton>Save event</SubmitButton></div>
        </form>
      )}

      <section className="card space-y-4 overflow-x-auto">
        <h2 className="h-display text-lg">Ticket types & waves</h2>
        <table className="table"><thead><tr><th>Name</th><th>Price</th><th>Qty</th><th>Left</th><th>Window</th><th>Flags</th><th></th></tr></thead>
          <tbody>{(types ?? []).map((t) => (
            <tr key={t.id}><td className="font-medium">{t.name}</td><td>{usd(t.price_cents)}</td><td>{t.quantity}</td><td>{remaining.get(t.id) ?? "—"}</td>
              <td className="text-xs text-muted">{t.sale_starts_at ? utcToBeirutInput(t.sale_starts_at).replace("T", " ") : "—"} → {t.sale_ends_at ? utcToBeirutInput(t.sale_ends_at).replace("T", " ") : "—"}</td>
              <td className="text-xs">{t.visible ? "visible" : "hidden"} · max {t.per_order_limit}{t.promo_eligible ? " · promo" : ""}</td>
              <td>{manage && <form action={deleteTicketType}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="event_id" value={id} /><ConfirmButton message="Delete this ticket type? (It will be hidden instead if it has orders.)">Remove</ConfirmButton></form>}</td></tr>
          ))}</tbody></table>
        {manage && (types ?? []).map((t) => (
          <details key={t.id} className="rounded-xl border border-line p-3"><summary className="cursor-pointer text-sm">Edit {t.name}</summary><TypeForm eventId={id} t={t} /></details>
        ))}
        {manage && <details className="rounded-xl border border-line p-3" open={!types?.length}><summary className="cursor-pointer text-sm font-semibold">Add ticket type / wave</summary><TypeForm eventId={id} /></details>}
      </section>

      <section id="expenses" className="card space-y-4 overflow-x-auto">
        <h2 className="h-display text-lg">Expenses & budget</h2>
        <table className="table"><thead><tr><th>Category</th><th>Description</th><th>Budgeted</th><th>Committed</th><th>Paid</th><th></th></tr></thead>
          <tbody>{(expenses ?? []).map((x) => (
            <tr key={x.id}><td>{x.category}</td><td>{x.description}</td><td>{usd(x.budgeted_cents)}</td><td>{usd(x.committed_cents)}</td><td>{usd(x.paid_cents)}</td>
              <td><form action={deleteExpense}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="event_id" value={id} /><ConfirmButton message="Delete this expense line?">Delete</ConfirmButton></form></td></tr>
          ))}
            <tr className="font-semibold"><td colSpan={2}>Total</td>{(["budgeted_cents", "committed_cents", "paid_cents"] as const).map((k) => <td key={k}>{usd((expenses ?? []).reduce((n, x) => n + x[k], 0))}</td>)}<td /></tr>
          </tbody></table>
        <form action={saveExpense} className="grid gap-2 sm:grid-cols-6">
          <input type="hidden" name="event_id" value={id} />
          <select name="category" className="input">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          <input className="input sm:col-span-2" name="description" placeholder="Description" />
          <input className="input" name="budgeted" type="number" step="0.01" min="0" placeholder="Budgeted $" />
          <input className="input" name="committed" type="number" step="0.01" min="0" placeholder="Committed $" />
          <input className="input" name="paid" type="number" step="0.01" min="0" placeholder="Paid $" />
          <div className="sm:col-span-6"><SubmitButton className="btn-ghost btn-sm">Add expense</SubmitButton></div>
        </form>
      </section>

      {manage && (
        <section className="card space-y-4 overflow-x-auto">
          <h2 className="h-display text-lg">Promo codes</h2>
          <table className="table"><thead><tr><th>Code</th><th>Discount</th><th>Max uses</th><th>Promoter</th><th>Scope</th><th></th></tr></thead>
            <tbody>{(promos ?? []).map((p) => (
              <tr key={p.id}><td className="font-mono">{p.code}</td><td>{p.discount_type === "percent" ? `${p.discount_value}%` : usd(p.discount_value)}</td><td>{p.max_uses ?? "∞"}</td>
                <td>{(p.promoters as { name: string } | null)?.name ?? "—"}</td><td>{p.event_id ? "this event" : "all events"}</td>
                <td><form action={togglePromo}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="event_id" value={id} /><input type="hidden" name="active" value={String(!p.active)} /><SubmitButton className="btn-ghost btn-sm">{p.active ? "Disable" : "Enable"}</SubmitButton></form></td></tr>
            ))}</tbody></table>
          <form action={savePromo} className="grid gap-2 sm:grid-cols-6">
            <input type="hidden" name="event_id" value={id} />
            <input className="input" name="code" placeholder="CODE" required />
            <select name="discount_type" className="input"><option value="percent">% off</option><option value="fixed">$ off</option></select>
            <input className="input" name="discount_value" type="number" step="0.01" min="0" placeholder="Value" required />
            <input className="input" name="max_uses" type="number" min="1" placeholder="Max uses" />
            <select name="promoter_id" className="input"><option value="">No promoter</option>{(promoters ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <SubmitButton className="btn-ghost btn-sm">Add code</SubmitButton>
          </form>
        </section>
      )}

      {manage && (
        <section className="card space-y-2">
          <h2 className="h-display text-lg">Sandbox cleanup</h2>
          <p className="text-sm text-muted">Cancels every sandbox (test) order for this event and invalidates their tickets. Do this before real sales/doors open.</p>
          <form action={cancelTestOrders}><input type="hidden" name="event_id" value={id} /><ConfirmButton message="Cancel ALL sandbox test orders for this event?">Cancel all test orders</ConfirmButton></form>
        </section>
      )}
    </div>
  );
}

type TT = { id: string; name: string; description: string | null; price_cents: number; quantity: number; per_order_limit: number; sale_starts_at: string | null; sale_ends_at: string | null; visible: boolean; promo_eligible: boolean; sort_order: number };
function TypeForm({ eventId, t }: { eventId: string; t?: TT }) {
  return (
    <form action={saveTicketType} className="mt-3 grid gap-2 sm:grid-cols-4">
      <input type="hidden" name="event_id" value={eventId} />{t && <input type="hidden" name="id" value={t.id} />}
      <Field label="Name" name="name" defaultValue={t?.name} required placeholder="Wave 1" />
      <Field label="Price (USD)" name="price" type="number" step="0.01" min="0" defaultValue={t ? money(t.price_cents) : ""} required />
      <Field label="Quantity" name="quantity" type="number" min="1" defaultValue={t?.quantity} required />
      <Field label="Per-order limit" name="per_order_limit" type="number" min="1" max="50" defaultValue={t?.per_order_limit ?? 6} />
      <Field label="Sale starts (Beirut)" name="sale_starts_at" type="datetime-local" defaultValue={utcToBeirutInput(t?.sale_starts_at)} />
      <Field label="Sale ends (Beirut)" name="sale_ends_at" type="datetime-local" defaultValue={utcToBeirutInput(t?.sale_ends_at)} />
      <Field label="Sort order" name="sort_order" type="number" defaultValue={t?.sort_order ?? 0} />
      <Field label="Description" name="description" defaultValue={t?.description} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="visible" defaultChecked={t?.visible ?? true} /> Visible</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="promo_eligible" defaultChecked={t?.promo_eligible ?? true} /> Promo codes apply</label>
      <div className="sm:col-span-4"><SubmitButton className="btn-ghost btn-sm">{t ? "Save" : "Add ticket type"}</SubmitButton></div>
    </form>
  );
}
