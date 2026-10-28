import "server-only";
import type { Session } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Events this staff member may see in admin (global roles see all). */
export async function staffEvents(s: Session) {
  const global = s.roles.some((r) => !r.event_id && r.role !== "promoter");
  let q = supabaseAdmin().from("events").select("id, title, slug, status, starts_at, capacity").order("starts_at", { ascending: false });
  if (!global) q = q.in("id", s.roles.map((r) => r.event_id).filter(Boolean) as string[]);
  return (await q).data ?? [];
}

export async function pickEvent(s: Session, requested?: string) {
  const events = await staffEvents(s);
  const now = Date.now();
  const fallback = [...events].reverse().find((e) => new Date(e.starts_at).getTime() > now - 86400000) ?? events[0];
  return { events, event: events.find((e) => e.id === requested) ?? fallback };
}
