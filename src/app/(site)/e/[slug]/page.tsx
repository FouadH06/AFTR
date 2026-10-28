import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Countdown } from "@/components/client";
import { Notice } from "@/components/ui";
import { getBrand } from "@/lib/brand";
import { publicEvent, typeOnSale } from "@/lib/data";
import { activeProvider } from "@/lib/payments";
import { fmtDate, fmtTime } from "@/lib/time";
import { BuyForm } from "./BuyForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await publicEvent((await params).slug);
  return d ? { title: d.event.title, description: d.event.description.slice(0, 160), openGraph: d.event.artwork_url ? { images: [d.event.artwork_url] } : undefined } : {};
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const d = await publicEvent((await params).slug);
  if (!d) notFound();
  const { event: e, venue, types } = d;
  const brand = await getBrand();
  const provider = activeProvider();
  const salesOpen = e.status === "on_sale" && provider && (!e.sales_start_at || new Date(e.sales_start_at) <= new Date()) && (!e.sales_end_at || new Date(e.sales_end_at) > new Date());
  const upcoming = new Date(e.starts_at).getTime() > Date.now();

  return (
    <article>
      <section className="relative overflow-hidden">
        <div className="glow-bg pointer-events-none absolute inset-0" aria-hidden />
        {e.artwork_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={e.artwork_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-bg" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-20">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">{fmtDate(e.starts_at)} · {fmtTime(e.starts_at)}–{fmtTime(e.ends_at)}</p>
          <h1 className="h-display mt-3 text-[clamp(2.2rem,8vw,5.5rem)]">{e.title}</h1>
          <p className="mt-3 text-muted">{venue?.venue_name ? `${venue.venue_name}${venue.address ? ` — ${venue.address}` : ""}` : `${e.area ?? "Beirut"} · exact location revealed soon`}</p>
          {upcoming && <div className="mt-6"><Countdown to={e.starts_at} /></div>}
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 lg:grid-cols-[1fr_26rem]">
        <div className="space-y-10">
          {e.description && <p className="whitespace-pre-line text-lg leading-relaxed text-fg/90">{e.description}</p>}
          {e.lineup.length > 0 && (
            <section><h2 className="h-display text-xl">Lineup</h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">{e.lineup.map((a) => (
                <li key={a.name} className="card py-3"><span className="h-display">{a.name}</span>{a.note && <span className="ml-2 text-sm text-muted">{a.note}</span>}</li>
              ))}</ul>
            </section>
          )}
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="card"><div className="label">Age</div>{e.age_policy}</div>
            <div className="card"><div className="label">Dress code</div>{e.dress_code || "Come as you are"}</div>
            <div className="card"><div className="label">Entry</div>Single-use QR + wristband at the door</div>
          </section>
          {e.rules && <section><h2 className="h-display text-xl">Rules</h2><p className="mt-3 whitespace-pre-line text-muted">{e.rules}</p></section>}
          {e.faq.length > 0 && (
            <section><h2 className="h-display text-xl">FAQ</h2>
              <div className="mt-4 divide-y divide-line rounded-2xl border border-line">{e.faq.map((f) => (
                <details key={f.q} className="group p-4"><summary className="cursor-pointer list-none font-medium">{f.q}<span className="float-right text-muted group-open:rotate-45">+</span></summary><p className="mt-2 text-sm text-muted">{f.a}</p></details>
              ))}</div>
            </section>
          )}
          <section><h2 className="h-display text-xl">Refunds</h2><p className="mt-3 text-sm text-muted">{e.refund_policy}</p></section>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="card space-y-4">
            <h2 className="h-display text-xl">Tickets</h2>
            {provider?.isTest && salesOpen && <Notice>TEST MODE: checkout uses a sandbox. No real payment is taken and test tickets are not valid for entry.</Notice>}
            {e.status === "sold_out" ? <Notice tone="bad">Sold out.</Notice>
              : salesOpen && types.length ? (
                <BuyForm eventId={e.id} minAge={brand.min_age} sandbox={!!provider?.isTest}
                  types={types.map((t) => ({ id: t.id, name: t.name, description: t.description, price_cents: t.price_cents, per_order_limit: t.per_order_limit, remaining: t.remaining, onSale: typeOnSale(t) }))} />
              ) : (
                <>
                  <p className="text-sm text-muted">{e.status === "completed" ? "This event has ended." : e.status === "cancelled" ? "This event was cancelled." : "Tickets aren't on sale yet. Early-access members hear first."}</p>
                  {types.length > 0 && <ul className="space-y-1 text-sm">{types.map((t) => <li key={t.id} className="flex justify-between"><span>{t.name}</span><span className="text-muted">${t.price_cents / 100}</span></li>)}</ul>}
                  {upcoming && <a href="/join" className="btn-primary w-full">Get early access</a>}
                </>
              )}
          </div>
        </aside>
      </div>
    </article>
  );
}
