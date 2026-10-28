import { Bars, Notice, Stat } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/server";
import { beirutDay } from "@/lib/time";

export default async function Marketing({ searchParams }: { searchParams: Promise<{ source?: string; medium?: string; campaign?: string; path?: string }> }) {
  const sp = await searchParams;
  await requireRole(["event_manager", "finance"]);
  const db = supabaseAdmin();
  const since = new Date(Date.now() - 13 * 86400000).toISOString();
  const [{ count: total }, { count: consented }, { data: recent }, { data: refs }, { data: paid }, { data: promos }] = await Promise.all([
    db.from("waitlist_entries").select("id", { count: "exact", head: true }),
    db.from("waitlist_entries").select("id", { count: "exact", head: true }).eq("marketing_consent", true),
    db.from("waitlist_entries").select("created_at, source").gte("created_at", since),
    db.from("waitlist_entries").select("referred_by").not("referred_by", "is", null).not("verified_at", "is", null).eq("referral_flagged", false),
    db.from("orders").select("email, utm, source, promoter_id, total_cents").eq("status", "paid").eq("is_test", false),
    db.from("promoters").select("id, name"),
  ]);
  const days = Array.from({ length: 14 }, (_, i) => beirutDay(new Date(Date.now() - (13 - i) * 86400000).toISOString()));
  const growth = days.map((d) => ({ label: d.slice(5), value: (recent ?? []).filter((r) => beirutDay(r.created_at) === d).length }));
  const counts = new Map<string, number>();
  for (const r of refs ?? []) counts.set(r.referred_by!, (counts.get(r.referred_by!) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const { data: names } = top.length ? await db.from("waitlist_entries").select("id, full_name, referral_code").in("id", top.map(([id]) => id)) : { data: [] };
  const leaderboard = top.map(([id, value]) => { const n = names?.find((x) => x.id === id); return { label: n ? `${n.full_name} (${n.referral_code})` : id.slice(0, 6), value }; });

  // Conversion: share of paid-buyer emails that were on the waitlist.
  const buyerEmails = [...new Set((paid ?? []).map((o) => o.email))];
  const { count: fromWaitlist } = buyerEmails.length ? await db.from("waitlist_entries").select("id", { count: "exact", head: true }).in("email", buyerEmails.slice(0, 1000)) : { count: 0 };
  const src = new Map<string, number>();
  for (const o of paid ?? []) { const k = o.utm?.utm_source || o.source || "direct"; src.set(k, (src.get(k) ?? 0) + o.total_cents); }
  const pname = new Map((promos ?? []).map((p) => [p.id, p.name]));
  const prom = new Map<string, number>();
  for (const o of paid ?? []) if (o.promoter_id) prom.set(pname.get(o.promoter_id) ?? "?", (prom.get(pname.get(o.promoter_id) ?? "?") ?? 0) + o.total_cents);
  const usd = (c: number) => `$${Math.round(c / 100)}`;

  const link = sp.source ? `${env.siteUrl}${sp.path || "/"}?${new URLSearchParams({ utm_source: sp.source, utm_medium: sp.medium || "social", ...(sp.campaign ? { utm_campaign: sp.campaign } : {}) })}` : null;

  return (
    <div className="space-y-6">
      <h1 className="h-display text-2xl">Marketing</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Waitlist" value={total ?? 0} sub={`${consented ?? 0} opted in to marketing`} />
        <Stat label="New (14 days)" value={recent?.length ?? 0} />
        <Stat label="Paying buyers" value={buyerEmails.length} />
        <Stat label="Buyers from waitlist" value={buyerEmails.length ? `${Math.round(((fromWaitlist ?? 0) / buyerEmails.length) * 100)}%` : "—"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card"><div className="label mb-3">Waitlist growth</div><Bars data={growth} /></div>
        <div className="card"><div className="label mb-3">Referral leaderboard (verified)</div><Bars data={leaderboard} /></div>
        <div className="card"><div className="label mb-3">Revenue by traffic source</div><Bars data={[...src].map(([label, value]) => ({ label, value }))} format={usd} /></div>
        <div className="card"><div className="label mb-3">Revenue by promoter</div><Bars data={[...prom].map(([label, value]) => ({ label, value }))} format={usd} /></div>
      </div>
      <form className="card grid gap-2 sm:grid-cols-5">
        <div className="label sm:col-span-5">Campaign link builder (UTM)</div>
        <input className="input" name="source" placeholder="source (instagram)" defaultValue={sp.source} required />
        <input className="input" name="medium" placeholder="medium (story)" defaultValue={sp.medium} />
        <input className="input" name="campaign" placeholder="campaign (wave1)" defaultValue={sp.campaign} />
        <input className="input" name="path" placeholder="path (/ or /e/slug)" defaultValue={sp.path} />
        <button className="btn-ghost btn-sm">Build link</button>
        {link && <code className="break-all rounded-lg bg-surface-2 p-3 text-xs sm:col-span-5">{link}</code>}
      </form>
      <Notice tone="info">Integrations not configured: email marketing, WhatsApp Business, Meta/TikTok pixels, analytics. Only first-party UTM/referral attribution is active; third-party pixels must be added behind a consent banner.</Notice>
    </div>
  );
}
