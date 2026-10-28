import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/public";
import { StatusBadge } from "@/components/ui";
import { can, getSession } from "@/lib/auth";
import { orderUrl } from "@/lib/keys";
import { usd } from "@/lib/money";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "My account" };

export default async function Account() {
  const s = await getSession();
  if (!s) redirect("/login?next=/account");
  // Orders placed while signed in, or with this (Supabase-verified) email address.
  const { data: orders } = await supabaseAdmin().from("orders").select("id, status, total_cents, created_at, is_test, events(title, starts_at)")
    .or(`user_id.eq.${s.user.id},email.eq.${JSON.stringify(s.user.email)}`).in("status", ["paid", "refunded", "cancelled", "refund_required", "pending"]).order("created_at", { ascending: false }).limit(50);
  const staff = can(s, ["event_manager", "finance"]), door = can(s, ["door_staff", "event_manager"]), promoter = can(s, ["promoter"]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <div className="flex items-center justify-between">
        <div><h1 className="h-display text-3xl">My tickets</h1><p className="text-sm text-muted">{s.user.email}</p></div>
        <form action={signOut}><button className="btn-ghost btn-sm">Sign out</button></form>
      </div>
      {(staff || door || promoter) && (
        <div className="flex flex-wrap gap-2">
          {staff && <Link href="/admin" className="btn-ghost btn-sm">Admin dashboard</Link>}
          {door && <Link href="/staff/scanner" className="btn-ghost btn-sm">Door scanner</Link>}
          {promoter && <Link href="/promoter" className="btn-ghost btn-sm">Promoter dashboard</Link>}
        </div>
      )}
      {!orders?.length ? <p className="text-muted">No orders yet. <Link href="/" className="text-accent underline">Find an event</Link>.</p> : (
        <ul className="space-y-2">{orders.map((o) => {
          const ev = o.events as unknown as { title: string; starts_at: string };
          return (
            <li key={o.id}><Link href={orderUrl(o.id)} className="card flex items-center justify-between hover:border-accent/60">
              <div><div className="font-semibold">{ev.title}{o.is_test && <span className="badge ml-2 text-warn">test</span>}</div><div className="text-xs text-muted">{fmtDate(ev.starts_at)} · {usd(o.total_cents)}</div></div>
              <StatusBadge s={o.status} />
            </Link></li>
          );
        })}</ul>
      )}
    </div>
  );
}
