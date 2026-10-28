import Link from "next/link";
import { Countdown } from "@/components/client";
import { getBrand } from "@/lib/brand";
import { LIVE, publicEvents, type EventRow } from "@/lib/data";
import { fmtDate, fmtTime } from "@/lib/time";

export const revalidate = 60;

function Hero({ kicker, title, sub, children, art }: { kicker?: string; title: string; sub: string; children?: React.ReactNode; art?: string | null }) {
  return (
    <section className="relative overflow-hidden">
      <div className="glow-bg animate-drift pointer-events-none absolute inset-[-20%]" aria-hidden />
      {art && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={art} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-bg/40 to-bg" aria-hidden />
      <div className="relative mx-auto flex min-h-[78dvh] max-w-6xl flex-col justify-end gap-6 px-4 pb-14 pt-24">
        {kicker && <p className="reveal text-xs font-semibold uppercase tracking-[0.3em] text-accent">{kicker}</p>}
        <h1 className="reveal h-display max-w-4xl text-[clamp(2.6rem,10vw,7rem)]">{title}</h1>
        <p className="reveal reveal-2 max-w-xl text-lg text-muted">{sub}</p>
        <div className="reveal reveal-3 flex flex-col gap-5">{children}</div>
      </div>
    </section>
  );
}

function EventCard({ e }: { e: EventRow }) {
  return (
    <Link href={`/e/${e.slug}`} className="card group block overflow-hidden p-0 transition hover:border-accent/60">
      <div className="relative aspect-[4/3] bg-surface-2">
        {e.artwork_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={e.artwork_url} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
          : <div className="glow-bg h-full w-full" />}
      </div>
      <div className="p-4">
        <p className="text-xs uppercase tracking-widest text-muted">{fmtDate(e.starts_at)}</p>
        <h3 className="h-display mt-1 text-lg">{e.title}</h3>
        {e.recap && <p className="mt-2 line-clamp-2 text-sm text-muted">{e.recap}</p>}
      </div>
    </Link>
  );
}

export default async function Home() {
  const [brand, events] = await Promise.all([getBrand(), publicEvents()]);
  const now = Date.now();
  const upcoming = events.filter((e) => new Date(e.ends_at).getTime() > now && e.status !== "completed" && e.status !== "cancelled");
  const featured = upcoming.find((e) => LIVE.includes(e.status));
  const past = events.filter((e) => e.status === "completed").reverse();

  return (
    <>
      {featured ? (
        <Hero kicker={`${fmtDate(featured.starts_at)} · ${fmtTime(featured.starts_at)} · ${featured.area ?? "Beirut"}`} title={featured.title}
          sub={featured.description.split("\n")[0] || brand.tagline} art={featured.artwork_url}>
          <Countdown to={featured.starts_at} />
          <div className="flex flex-wrap gap-3">
            <Link href={`/e/${featured.slug}`} className="btn-primary">{featured.status === "on_sale" ? "Get tickets" : featured.status === "sold_out" ? "Sold out — details" : "Event details"}</Link>
            <Link href="/join" className="btn-ghost">Join the list</Link>
          </div>
        </Hero>
      ) : (
        <Hero kicker={brand.name} title={brand.hero_headline} sub={brand.tagline}>
          {brand.launch_at && new Date(brand.launch_at).getTime() > now && <Countdown to={brand.launch_at} />}
          <div className="flex flex-wrap gap-3">
            <Link href="/join" className="btn-primary">Get early access</Link>
            {brand.instagram_url && <a href={brand.instagram_url} target="_blank" rel="noopener noreferrer" className="btn-ghost">Follow on Instagram</a>}
          </div>
        </Hero>
      )}

      <section className="mx-auto grid max-w-6xl gap-4 px-4 sm:grid-cols-3">
        {[["Invite only energy", "Early-access members hear first and get first pick of the cheapest wave."],
          ["Bring your people", "Share your link. Verified friends who join move you up the reward tiers."],
          ["One scan, you're in", "Secure single-use QR tickets. Get scanned, get your wristband, get lost in it."]].map(([t, d]) => (
          <div key={t} className="card"><h3 className="h-display text-sm text-accent">{t}</h3><p className="mt-2 text-sm text-muted">{d}</p></div>
        ))}
      </section>

      {upcoming.length > 0 && (
        <section id="events" className="mx-auto mt-20 max-w-6xl px-4">
          <h2 className="h-display text-2xl">Upcoming</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{upcoming.map((e) => <EventCard key={e.id} e={e} />)}</div>
        </section>
      )}
      {past.length > 0 && (
        <section className="mx-auto mt-20 max-w-6xl px-4">
          <h2 className="h-display text-2xl">Past nights</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{past.map((e) => <EventCard key={e.id} e={e} />)}</div>
        </section>
      )}
    </>
  );
}
