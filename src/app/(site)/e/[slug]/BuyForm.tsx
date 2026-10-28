"use client";
import { useActionState, useMemo, useState } from "react";
import { buyTickets, type FormState } from "@/app/actions/public";
import { SubmitButton } from "@/components/client";

type T = { id: string; name: string; description: string | null; price_cents: number; per_order_limit: number; remaining: number; onSale: boolean };
const usd = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

export function BuyForm({ eventId, types, minAge, sandbox }: { eventId: string; types: T[]; minAge: number; sandbox: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(buyTickets, undefined);
  const [qty, setQty] = useState<Record<string, number>>({});
  const idem = useMemo(() => crypto.randomUUID(), []);
  const total = types.reduce((s, t) => s + (qty[t.id] ?? 0) * t.price_cents, 0);
  const count = Object.values(qty).reduce((a, b) => a + b, 0);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="idem" value={idem} />
      <div className="space-y-3">
        {types.map((t) => {
          const max = Math.min(t.per_order_limit, t.remaining);
          const n = qty[t.id] ?? 0;
          const disabled = !t.onSale || t.remaining <= 0;
          return (
            <div key={t.id} className={`flex items-center justify-between gap-3 rounded-2xl border p-4 transition ${n ? "border-accent bg-accent/5" : "border-line bg-surface"} ${disabled ? "opacity-50" : ""}`}>
              <div className="min-w-0">
                <div className="font-semibold">{t.name}</div>
                {t.description && <div className="text-xs text-muted">{t.description}</div>}
                <div className="mt-1 text-xs text-muted">{t.remaining <= 0 ? "Sold out" : !t.onSale ? "Not on sale" : t.remaining <= 20 ? `Only ${t.remaining} left` : "Available"}</div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="h-display text-lg">{usd(t.price_cents)}</span>
                <input type="hidden" name={`qty_${t.id}`} value={n} />
                {!disabled && (
                  <div className="flex items-center rounded-full border border-line">
                    <button type="button" aria-label={`Fewer ${t.name}`} className="h-9 w-9 text-lg" onClick={() => setQty({ ...qty, [t.id]: Math.max(0, n - 1) })}>−</button>
                    <span className="w-6 text-center tabular-nums">{n}</span>
                    <button type="button" aria-label={`More ${t.name}`} className="h-9 w-9 text-lg" onClick={() => setQty({ ...qty, [t.id]: Math.min(max, n + 1) })}>+</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {count > 0 && (
        <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input className="input" name="full_name" placeholder="Full name (as on ID)" required autoComplete="name" />
            <input className="input" name="email" type="email" placeholder="Email (tickets are sent here)" required autoComplete="email" />
            <input className="input" name="phone" type="tel" placeholder="Phone, e.g. 03 123 456" required autoComplete="tel" />
            <input className="input" name="promo" placeholder="Promo code (optional)" autoCapitalize="characters" />
          </div>
          <label className="flex gap-2 text-sm"><input type="checkbox" name="age" required /> I confirm I am {minAge}+ and will bring valid ID.</label>
          <label className="flex gap-2 text-sm"><input type="checkbox" name="terms" required /> I accept the event rules, refund policy and <a href="/privacy" className="underline">privacy terms</a>.</label>
          {state?.error && <p className="text-sm text-bad" role="alert">{state.error}</p>}
          <SubmitButton className="btn-primary w-full" pendingText="Reserving your tickets…">
            {sandbox ? "Continue to TEST checkout" : "Continue to payment"} · {count} × · {usd(total)}
          </SubmitButton>
          <p className="text-center text-xs text-muted">Tickets are held for 15 minutes while you pay. Final price is confirmed on the next step.</p>
        </div>
      )}
    </form>
  );
}
