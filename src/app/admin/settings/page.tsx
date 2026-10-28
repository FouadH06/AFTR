import { saveBrand } from "@/app/actions/admin";
import { SubmitButton } from "@/components/client";
import { Field, TextArea } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getBrand } from "@/lib/brand";
import { emailConfigured } from "@/lib/email";
import { providers } from "@/lib/payments";
import { utcToBeirutInput } from "@/lib/time";

export default async function Settings() {
  await requireRole([]);
  const b = await getBrand();
  return (
    <div className="space-y-6">
      <h1 className="h-display text-2xl">Brand & settings</h1>
      <form action={saveBrand} className="card grid max-w-3xl gap-3 sm:grid-cols-2">
        <Field label="Brand name" name="name" defaultValue={b.name} required />
        <Field label="Logo URL (https, optional)" name="logo_url" defaultValue={b.logo_url} />
        <Field label="Hero headline" name="hero_headline" defaultValue={b.hero_headline} />
        <Field label="Tagline" name="tagline" defaultValue={b.tagline} />
        <Field label="Primary color" name="primary_color" defaultValue={b.primary_color} pattern="#[0-9A-Fa-f]{6}" />
        <Field label="Secondary color" name="secondary_color" defaultValue={b.secondary_color} pattern="#[0-9A-Fa-f]{6}" />
        <Field label="Instagram URL" name="instagram_url" defaultValue={b.instagram_url} />
        <Field label="TikTok URL" name="tiktok_url" defaultValue={b.tiktok_url} />
        <Field label="Contact email" name="contact_email" type="email" defaultValue={b.contact_email} />
        <Field label="Launch countdown (Beirut, optional)" name="launch_at" type="datetime-local" defaultValue={utcToBeirutInput(b.launch_at)} hint="Only shown if set — no fake countdowns" />
        <Field label="Minimum age" name="min_age" type="number" min={0} max={99} defaultValue={b.min_age} hint="Review against Lebanese rules & venue terms" />
        <Field label="Processing fee % (for estimates)" name="processing_fee_pct" type="number" step="0.01" min={0} max={100} defaultValue={b.processing_fee_pct} />
        <div className="sm:col-span-2"><TextArea label="Referral reward tiers (one per line: threshold | label)" name="referral_tiers" defaultValue={b.referral_tiers.map((t) => `${t.threshold} | ${t.label}`).join("\n")} hint="Rewards always require manual approval in Waitlist" /></div>
        <div className="sm:col-span-2"><SubmitButton>Save settings</SubmitButton></div>
      </form>
      <div className="card max-w-3xl space-y-2 text-sm">
        <h2 className="h-display text-lg">Integrations</h2>
        {providers.map((p) => <div key={p.id} className="flex justify-between"><span>{p.label}</span><span className={p.configured() ? "text-ok" : "text-muted"}>{p.configured() ? "active" : "not configured"}</span></div>)}
        <div className="flex justify-between"><span>Transactional email (Resend)</span><span className={emailConfigured() ? "text-ok" : "text-muted"}>{emailConfigured() ? "active" : "not configured"}</span></div>
      </div>
    </div>
  );
}
