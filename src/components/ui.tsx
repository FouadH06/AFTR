import Link from "next/link";
import type { Brand } from "@/lib/brand";

export function Logo({ brand }: { brand: Brand }) {
  return brand.logo_url
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={brand.logo_url} alt={brand.name} className="h-7 w-auto" />
    : <span className="h-display text-lg tracking-[0.2em]">{brand.name}</span>;
}

export function SiteHeader({ brand }: { brand: Brand }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" aria-label="Home"><Logo brand={brand} /></Link>
        <nav className="flex items-center gap-1 text-sm sm:gap-3">
          <Link href="/#events" className="hidden px-2 py-1 text-muted hover:text-fg sm:inline">Events</Link>
          <Link href="/account" className="px-2 py-1 text-muted hover:text-fg">My tickets</Link>
          <Link href="/join" className="btn-primary btn-sm">Early access</Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter({ brand }: { brand: Brand }) {
  return (
    <footer className="mt-24 border-t border-line/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <div><Logo brand={brand} /><p className="mt-2">Beirut, Lebanon</p></div>
        <div className="flex flex-wrap gap-4">
          {brand.instagram_url && <a href={brand.instagram_url} target="_blank" rel="noopener noreferrer" className="hover:text-fg">Instagram</a>}
          {brand.tiktok_url && <a href={brand.tiktok_url} target="_blank" rel="noopener noreferrer" className="hover:text-fg">TikTok</a>}
          <Link href="/privacy" className="hover:text-fg">Privacy & terms</Link>
          {brand.contact_email && <a href={`mailto:${brand.contact_email}`} className="hover:text-fg">Contact</a>}
        </div>
      </div>
    </footer>
  );
}

export function Field({ label, name, type = "text", defaultValue, required, placeholder, hint, ...rest }:
  { label: string; name: string; type?: string; defaultValue?: string | number | null; required?: boolean; placeholder?: string; hint?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "defaultValue">) {
  return (
    <label className="block">
      <span className="label">{label}{required && " *"}</span>
      <input className="input" name={name} type={type} defaultValue={defaultValue ?? undefined} required={required} placeholder={placeholder} {...rest} />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function TextArea({ label, name, defaultValue, rows = 3, hint }: { label: string; name: string; defaultValue?: string | null; rows?: number; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <textarea className="input font-mono text-xs" name={name} rows={rows} defaultValue={defaultValue ?? ""} />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Notice({ tone = "warn", children }: { tone?: "warn" | "bad" | "ok" | "info"; children: React.ReactNode }) {
  const c = { warn: "border-warn/40 bg-warn/10 text-warn", bad: "border-bad/40 bg-bad/10 text-bad", ok: "border-ok/40 bg-ok/10 text-ok", info: "border-accent-2/40 bg-accent-2/10 text-fg" }[tone];
  return <div className={`rounded-xl border px-4 py-3 text-sm ${c}`}>{children}</div>;
}

export function SetupRequired({ missing = [] }: { missing?: string[] }) {
  return (
    <div className="mx-auto max-w-xl p-6">
      <Notice>Setup required. Missing on the server: {missing.join(", ") || "Supabase / signing settings"}. Add them in your hosting environment variables and redeploy. See README.md.</Notice>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** Minimal dependency-free horizontal bar chart. */
export function Bars({ data, format = (n: number) => String(n) }: { data: { label: string; value: number }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="text-sm text-muted">No data yet.</p>;
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="grid grid-cols-[7rem_1fr_4.5rem] items-center gap-2 text-xs">
          <span className="truncate text-muted">{d.label}</span>
          <div className="h-2.5 rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${(d.value / max) * 100}%` }} /></div>
          <span className="text-right tabular-nums">{format(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

export const STATUS_TONE: Record<string, string> = {
  paid: "text-ok border-ok/40", valid: "text-ok border-ok/40", on_sale: "text-ok border-ok/40",
  pending: "text-warn border-warn/40", announced: "text-accent-2 border-accent-2/40", waitlist: "text-accent-2 border-accent-2/40",
  used: "text-muted", completed: "text-muted", draft: "text-muted",
  failed: "text-bad border-bad/40", cancelled: "text-bad border-bad/40", refunded: "text-bad border-bad/40",
  refund_required: "text-bad border-bad/40", sold_out: "text-warn border-warn/40", expired: "text-muted",
};
export const StatusBadge = ({ s }: { s: string }) => <span className={`badge ${STATUS_TONE[s] ?? ""}`}>{s.replace("_", " ")}</span>;
