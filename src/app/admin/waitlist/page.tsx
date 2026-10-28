import Link from "next/link";
import { waitlistAction } from "@/app/actions/admin";
import { SubmitButton } from "@/components/client";
import { Notice, Stat } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getBrand } from "@/lib/brand";
import { emailConfigured } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/time";

const PAGE = 50;

export default async function Waitlist({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const sp = await searchParams;
  await requireRole(["event_manager"]);
  const db = supabaseAdmin();
  const page = Math.max(1, Number(sp.page) || 1);
  let q = db.from("waitlist_entries").select("id, full_name, email, phone, instagram, verified_at, referral_code, referral_flagged, marketing_consent, source, created_at, referred_by", { count: "exact" })
    .order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  const term = (sp.q ?? "").trim().replace(/[%,()*"\\]/g, "");
  if (term) q = q.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,referral_code.eq.${term.toUpperCase()}`);
  const [{ data: rows, count }, { data: refRows }, { data: grants }, brand] = await Promise.all([
    q, db.from("waitlist_entries").select("referred_by").not("referred_by", "is", null).not("verified_at", "is", null).eq("referral_flagged", false),
    db.from("reward_grants").select("waitlist_entry_id, threshold, status"), getBrand(),
  ]);
  const refs = new Map<string, number>();
  for (const r of refRows ?? []) refs.set(r.referred_by!, (refs.get(r.referred_by!) ?? 0) + 1);
  const grantOf = (id: string, t: number) => grants?.find((g) => g.waitlist_entry_id === id && g.threshold === t)?.status;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="h-display text-2xl">Waitlist</h1>{/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download */}
        <a className="btn-ghost btn-sm" href="/api/export/waitlist">Export consented CSV</a></div>
      {!emailConfigured() && <Notice>Email is not configured, so signups can&apos;t self-verify. Referrals only count for verified signups — verify manually below or configure Resend.</Notice>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="Total signups" value={count ?? 0} /><Stat label="Verified referrals" value={refRows?.length ?? 0} /></div>
      <form className="flex gap-2"><input className="input max-w-xs" name="q" defaultValue={sp.q} placeholder="Search name, email, phone, code" /><button className="btn-ghost btn-sm">Search</button></form>
      <div className="card overflow-x-auto p-0">
        <table className="table"><thead><tr><th>Name</th><th>Contact</th><th>Code</th><th>Verified refs</th><th>Rewards</th><th>Status</th><th>Joined</th></tr></thead>
          <tbody>{(rows ?? []).map((r) => {
            const n = refs.get(r.id) ?? 0;
            return (
              <tr key={r.id}>
                <td className="font-medium">{r.full_name}{r.instagram && <div className="text-xs text-muted">@{r.instagram}</div>}</td>
                <td className="text-xs">{r.email}<br />{r.phone}{r.marketing_consent && <span className="badge ml-1 text-ok">opt-in</span>}</td>
                <td className="font-mono text-xs">{r.referral_code}</td>
                <td>{n}</td>
                <td className="space-y-1 text-xs">{brand.referral_tiers.filter((t) => n >= t.threshold).map((t) => {
                  const g = grantOf(r.id, t.threshold);
                  return <div key={t.threshold} className="flex items-center gap-1">{t.label}: {g ?? "awaiting review"}
                    {!g && ["approve", "reject"].map((op) => <form key={op} action={waitlistAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="op" value={op} /><input type="hidden" name="threshold" value={t.threshold} /><input type="hidden" name="label" value={t.label} /><SubmitButton className="btn-ghost btn-sm">{op}</SubmitButton></form>)}</div>;
                })}</td>
                <td className="space-y-1 text-xs">
                  {r.verified_at ? <span className="text-ok">verified</span> : <form action={waitlistAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="op" value="verify" /><SubmitButton className="btn-ghost btn-sm">Mark verified</SubmitButton></form>}
                  {r.referred_by && <form action={waitlistAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="op" value={r.referral_flagged ? "unflag" : "flag"} />
                    <SubmitButton className="btn-ghost btn-sm">{r.referral_flagged ? "Flagged — unflag" : "Flag referral"}</SubmitButton></form>}
                </td>
                <td className="text-xs text-muted">{fmtDateTime(r.created_at)}<div>{r.source}</div></td>
              </tr>
            );
          })}</tbody></table>
      </div>
      <div className="flex items-center gap-3 text-sm text-muted">
        {page > 1 && <Link className="btn-ghost btn-sm" href={`?q=${sp.q ?? ""}&page=${page - 1}`}>← Prev</Link>}<span>Page {page}</span>
        {page * PAGE < (count ?? 0) && <Link className="btn-ghost btn-sm" href={`?q=${sp.q ?? ""}&page=${page + 1}`}>Next →</Link>}
      </div>
    </div>
  );
}
