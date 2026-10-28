import { SetupRequired } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { isConfigured } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/server";
import { Scanner } from "./Scanner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Door scanner", robots: { index: false } };

export default async function ScannerPage() {
  if (!isConfigured()) return <SetupRequired />;
  const s = await requireRole(["door_staff", "event_manager"], null, "/staff/scanner");
  const global = s.roles.some((r) => r.role === "super_admin" || ((r.role === "door_staff" || r.role === "event_manager") && !r.event_id));
  const assigned = s.roles.filter((r) => r.event_id && (r.role === "door_staff" || r.role === "event_manager")).map((r) => r.event_id!);
  let query = supabaseAdmin().from("events").select("id, title, starts_at").in("status", ["announced", "on_sale", "sold_out", "completed"])
    .gte("ends_at", new Date(Date.now() - 86400000).toISOString()).order("starts_at");
  if (!global) query = query.in("id", assigned.length ? assigned : ["00000000-0000-0000-0000-000000000000"]);
  const { data: events } = await query;
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line px-4 py-3 text-center text-sm font-semibold uppercase tracking-widest">Door scanner · {s.user.email}</header>
      {events?.length ? <Scanner events={events} /> : <p className="p-6 text-center text-muted">No active events assigned to you.</p>}
    </div>
  );
}
