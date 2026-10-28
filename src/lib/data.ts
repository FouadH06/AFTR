import "server-only";
import { supabasePublic } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/env";

export type EventRow = {
  id: string; slug: string; title: string; description: string; starts_at: string; ends_at: string; area: string | null;
  venue_public: boolean; capacity: number; age_policy: string; dress_code: string | null; artwork_url: string | null;
  status: string; sales_start_at: string | null; sales_end_at: string | null; refund_policy: string; rules: string | null;
  faq: { q: string; a: string }[]; lineup: { name: string; note?: string }[]; links: Record<string, string>; recap: string | null;
};
export type TicketTypeRow = {
  id: string; event_id: string; name: string; description: string | null; price_cents: number; quantity: number;
  sale_starts_at: string | null; sale_ends_at: string | null; visible: boolean; per_order_limit: number; promo_eligible: boolean; sort_order: number;
};

export const LIVE = ["announced", "on_sale", "sold_out"];

export async function publicEvents(): Promise<EventRow[]> {
  if (!isConfigured()) return [];
  const { data } = await supabasePublic().from("events").select("*").neq("status", "draft").order("starts_at", { ascending: true });
  return (data ?? []) as EventRow[];
}

export async function publicEvent(slug: string) {
  if (!isConfigured()) return null;
  const db = supabasePublic();
  const { data: event } = await db.from("events").select("*").eq("slug", slug).neq("status", "draft").maybeSingle();
  if (!event) return null;
  const [{ data: types }, { data: avail }, { data: venue }] = await Promise.all([
    db.from("ticket_types").select("*").eq("event_id", event.id).eq("visible", true).order("sort_order").order("price_cents"),
    db.rpc("get_ticket_availability", { p_event: event.id }),
    db.from("event_venues").select("*").eq("event_id", event.id).maybeSingle(), // RLS hides it until venue_public
  ]);
  const remaining = new Map<string, number>((avail ?? []).map((a: { ticket_type_id: string; remaining: number }) => [a.ticket_type_id, a.remaining]));
  return {
    event: event as EventRow,
    venue: venue as { venue_name: string | null; address: string | null; map_url: string | null } | null,
    types: ((types ?? []) as TicketTypeRow[]).map((t) => ({ ...t, remaining: remaining.get(t.id) ?? 0 })),
  };
}

/** Is this ticket type purchasable right now (ignoring stock)? */
export function typeOnSale(t: TicketTypeRow, now = Date.now()) {
  return (!t.sale_starts_at || new Date(t.sale_starts_at).getTime() <= now) && (!t.sale_ends_at || new Date(t.sale_ends_at).getTime() > now);
}
