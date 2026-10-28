import { redirect } from "next/navigation";
import { sandboxPay } from "@/app/actions/public";
import { SubmitButton } from "@/components/client";
import { Notice } from "@/components/ui";
import { checkOrderKey, orderUrl } from "@/lib/keys";
import { usd } from "@/lib/money";
import { sandbox } from "@/lib/payments";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fmtTime } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sandbox checkout", robots: { index: false } };

export default async function SandboxCheckout({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ k?: string }> }) {
  const [{ id }, { k }] = await Promise.all([params, searchParams]);
  if (!sandbox.configured() || !checkOrderKey(id, k)) return <div className="mx-auto max-w-xl p-6"><Notice tone="bad">Checkout unavailable.</Notice></div>;
  const { data: o } = await supabaseAdmin().from("orders")
    .select("status, total_cents, subtotal_cents, discount_cents, expires_at, events(title), order_items(quantity, unit_price_cents, ticket_types(name))").eq("id", id).single();
  if (!o) return <div className="mx-auto max-w-xl p-6"><Notice tone="bad">Order not found.</Notice></div>;
  if (o.status !== "pending") redirect(orderUrl(id));
  const items = o.order_items as unknown as { quantity: number; unit_price_cents: number; ticket_types: { name: string } }[];

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-12">
      <div className="rounded-2xl border-2 border-dashed border-warn bg-warn/10 p-4 text-center">
        <p className="h-display text-lg text-warn">Sandbox payment</p>
        <p className="mt-1 text-sm">No real money moves. Tickets from this checkout are marked TEST and are not valid for entry.</p>
      </div>
      <div className="card space-y-2">
        <h1 className="h-display text-lg">{(o.events as unknown as { title: string }).title}</h1>
        {items.map((i) => <div key={i.ticket_types.name} className="flex justify-between text-sm"><span>{i.quantity} × {i.ticket_types.name}</span><span>{usd(i.quantity * i.unit_price_cents)}</span></div>)}
        {o.discount_cents > 0 && <div className="flex justify-between text-sm text-accent"><span>Discount</span><span>−{usd(o.discount_cents)}</span></div>}
        <div className="flex justify-between border-t border-line pt-2 font-semibold"><span>Total</span><span>{usd(o.total_cents)}</span></div>
        <p className="text-xs text-muted">Reserved until {fmtTime(o.expires_at)} (Beirut).</p>
      </div>
      <form action={sandboxPay} className="grid gap-2">
        <input type="hidden" name="order_id" value={id} /><input type="hidden" name="k" value={k} /><input type="hidden" name="outcome" value="success" />
        <SubmitButton className="btn-primary w-full" pendingText="Processing…">Simulate successful payment</SubmitButton>
      </form>
      <form action={sandboxPay}>
        <input type="hidden" name="order_id" value={id} /><input type="hidden" name="k" value={k} /><input type="hidden" name="outcome" value="fail" />
        <SubmitButton className="btn-ghost w-full" pendingText="Processing…">Simulate failed payment</SubmitButton>
      </form>
    </div>
  );
}
