import Link from "next/link";
import { SetupRequired } from "@/components/ui";
import { can, requireRole } from "@/lib/auth";
import { isConfigured } from "@/lib/env";
import { getBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!isConfigured()) return <SetupRequired />;
  const s = await requireRole(["event_manager", "finance"], null, "/admin");
  const brand = await getBrand();
  const nav = [
    ["Dashboard", "/admin", true], ["Events", "/admin/events", can(s, ["event_manager"])], ["Orders", "/admin/orders", true],
    ["Waitlist", "/admin/waitlist", can(s, ["event_manager"])], ["Marketing", "/admin/marketing", true], ["Promoters", "/admin/promoters", true],
    ["Team", "/admin/team", can(s, [])], ["Brand", "/admin/settings", can(s, [])], ["Audit log", "/admin/audit", can(s, [])],
    ["Door scanner", "/staff/scanner", can(s, ["door_staff", "event_manager"])],
  ] as const;
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[13rem_1fr]">
      <aside className="border-b border-line bg-surface/60 md:min-h-dvh md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-4"><Link href="/" className="h-display tracking-[0.2em]">{brand.name}</Link><span className="badge text-muted">Ops</span></div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 text-sm md:flex-col md:overflow-visible">
          {nav.filter(([, , ok]) => ok).map(([l, h]) => <Link key={h} href={h} className="whitespace-nowrap rounded-lg px-3 py-2 text-muted hover:bg-white/5 hover:text-fg">{l}</Link>)}
        </nav>
        <div className="hidden px-4 py-3 text-xs text-muted md:block">{s.user.email}<br />{s.roles.map((r) => r.role).join(", ")}</div>
      </aside>
      <div className="min-w-0 p-4 md:p-8">{children}</div>
    </div>
  );
}
