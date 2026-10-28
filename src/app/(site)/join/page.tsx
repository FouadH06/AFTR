import { getBrand } from "@/lib/brand";
import { JoinForm } from "./JoinForm";

export const metadata = { title: "Early access" };

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const [brand, { ref }] = await Promise.all([getBrand(), searchParams]);
  return (
    <div className="relative">
      <div className="glow-bg pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative mx-auto grid max-w-5xl gap-10 px-4 py-16 md:grid-cols-2 md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Early access</p>
          <h1 className="h-display mt-3 text-5xl sm:text-6xl">Be first through the door.</h1>
          <p className="mt-4 text-muted">Members hear about every night before it goes public and get first access to the cheapest ticket wave.</p>
          <ul className="mt-6 space-y-2 text-sm">
            {brand.referral_tiers.map((t) => <li key={t.threshold} className="flex gap-3"><span className="badge border-accent/50 text-accent">{t.threshold} friends</span>{t.label}</li>)}
          </ul>
          <p className="mt-3 text-xs text-muted">Referral rewards count verified signups only and are reviewed before they&apos;re granted.</p>
        </div>
        <JoinForm refCode={ref?.toUpperCase().slice(0, 12)} minAge={brand.min_age} />
      </div>
    </div>
  );
}
