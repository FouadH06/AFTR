import Link from "next/link";
import { CopyButton } from "@/components/client";
import { Notice } from "@/components/ui";
import { getBrand } from "@/lib/brand";
import { LIVE, publicEvents } from "@/lib/data";
import { emailConfigured } from "@/lib/email";
import { env, isConfigured } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/time";
import { sha256 } from "@/lib/tokens";

export const dynamic = "force-dynamic";
export const metadata = { title: "My early access", robots: { index: false } };

export default async function WaitlistMe({ searchParams }: { searchParams: Promise<{ t?: string; new?: string }> }) {
  const { t, new: isNew } = await searchParams;
  if (!isConfigured() || !t) return <div className="mx-auto max-w-xl p-6"><Notice>Invalid or expired link.</Notice></div>;
  const db = supabaseAdmin();
  const { data: me } = await db.from("waitlist_entries").select("id, full_name, referral_code, verified_at, created_at").eq("access_token_hash", sha256(t)).maybeSingle();
  if (!me) return <div className="mx-auto max-w-xl p-6"><Notice>Invalid or expired link. Rejoin with the same email to get a fresh one.</Notice></div>;

  const [{ count: verifiedRefs }, { count: position }, { data: grants }, brand, events] = await Promise.all([
    db.from("waitlist_entries").select("id", { count: "exact", head: true }).eq("referred_by", me.id).not("verified_at", "is", null).eq("referral_flagged", false),
    db.from("waitlist_entries").select("id", { count: "exact", head: true }).lte("created_at", me.created_at),
    db.from("reward_grants").select("threshold, status").eq("waitlist_entry_id", me.id),
    getBrand(), publicEvents(),
  ]);
  const refs = verifiedRefs ?? 0;
  const link = `${env.siteUrl}/join?ref=${me.referral_code}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(`Join me on the ${brand.name} early access list: ${link}`)}`;
  const announcements = events.filter((e) => LIVE.includes(e.status) && new Date(e.ends_at) > new Date());

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      {isNew && <Notice tone="ok">You&apos;re on the list! Bookmark this page — it&apos;s your private link.</Notice>}
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-accent">Early access · #{position}</p>
        <h1 className="h-display mt-2 text-4xl">Hey {me.full_name.split(" ")[0]}.</h1>
        {!me.verified_at && <p className="mt-2 text-sm text-warn">{emailConfigured() ? "Confirm your email (check your inbox) so your signup and referrals count." : "Email confirmation pending."}</p>}
      </div>
      <div className="card space-y-3">
        <div className="label">Your referral link</div>
        <code className="block break-all rounded-lg bg-surface-2 p-3 text-sm">{link}</code>
        <div className="flex flex-wrap gap-2"><CopyButton text={link} /><a href={wa} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm">Share on WhatsApp</a></div>
      </div>
      <div className="card">
        <div className="flex items-baseline justify-between"><div className="label">Verified referrals</div><div className="h-display text-3xl text-accent">{refs}</div></div>
        <ul className="mt-4 space-y-2">
          {brand.referral_tiers.map((tier) => {
            const g = grants?.find((x) => x.threshold === tier.threshold);
            const state = g?.status === "approved" ? "Granted" : g?.status === "rejected" ? "Not approved" : refs >= tier.threshold ? "Unlocked — under review" : `${tier.threshold - refs} to go`;
            return <li key={tier.threshold} className="flex items-center justify-between text-sm"><span>{tier.threshold} · {tier.label}</span><span className={refs >= tier.threshold ? "text-accent" : "text-muted"}>{state}</span></li>;
          })}
        </ul>
      </div>
      {announcements.length > 0 && (
        <div className="card space-y-2"><div className="label">Announcements</div>
          {announcements.map((e) => <Link key={e.id} href={`/e/${e.slug}`} className="flex justify-between text-sm hover:text-accent"><span>{e.title}</span><span className="text-muted">{fmtDate(e.starts_at)}</span></Link>)}
        </div>
      )}
    </div>
  );
}
