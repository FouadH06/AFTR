"use server";
import { can, getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/request";
import { supabaseAdmin } from "@/lib/supabase/server";
import { parseTicketPayload } from "@/lib/tokens";

export type ScanResult = {
  result: "admitted" | "already_used" | "wrong_event" | "cancelled" | "invalid" | "event_not_active" | "error";
  ticket_type?: string | null; attendee_name?: string | null; checked_in_at?: string | null; is_test?: boolean; message?: string;
};

async function staffFor(eventId: string) {
  const s = await getSession();
  if (!s || !can(s, ["door_staff", "event_manager"], eventId)) throw new Error("Not authorized for this event");
  if (!(await rateLimit("scan", 240, 60, s.user.id))) throw new Error("Slow down");
  return s;
}

async function admit(eventId: string, ticketId: string, staffId: string): Promise<ScanResult> {
  const db = supabaseAdmin();
  const { data, error } = await db.rpc("scan_ticket", { p_ticket: ticketId, p_event: eventId, p_staff: staffId });
  if (error) return { result: "error", message: "Server error — retry. Do not admit until you get a green result." };
  const r = data as ScanResult;
  const { data: t } = await db.from("tickets").select("orders(is_test)").eq("id", ticketId).maybeSingle();
  return { ...r, is_test: !!(t?.orders as unknown as { is_test: boolean } | null)?.is_test };
}

export async function scanPayload(eventId: string, payload: string): Promise<ScanResult> {
  try {
    const s = await staffFor(eventId);
    const ticketId = parseTicketPayload(env.signingSecret, payload);
    if (!ticketId) {
      await supabaseAdmin().from("ticket_scans").insert({ event_id: eventId, staff_id: s.user.id, result: "invalid_signature" });
      return { result: "invalid", message: "Not a valid ticket QR (forged or damaged)." };
    }
    return await admit(eventId, ticketId, s.user.id);
  } catch (e) {
    return { result: "error", message: (e as Error).message };
  }
}

/** Supervisor fallback when a QR won't scan: search this event's tickets by name/email/phone. */
export async function lookupTickets(eventId: string, q: string) {
  await staffFor(eventId);
  const term = q.trim().replace(/[%,()*"\\]/g, "");
  if (term.length < 3) return [];
  const { data } = await supabaseAdmin().from("orders").select("full_name, email, is_test, tickets(id, status, checked_in_at, ticket_types(name))")
    .eq("event_id", eventId).eq("status", "paid").or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`).limit(10);
  return (data ?? []).flatMap((o) => (o.tickets as unknown as { id: string; status: string; checked_in_at: string | null; ticket_types: { name: string } }[]).map((t) => ({
    id: t.id, status: t.status, checked_in_at: t.checked_in_at, type: t.ticket_types.name, name: o.full_name, email: o.email.replace(/^(.{2}).*(@.*)$/, "$1***$2"), is_test: o.is_test,
  })));
}

export async function admitById(eventId: string, ticketId: string): Promise<ScanResult> {
  try {
    const s = await staffFor(eventId);
    return await admit(eventId, ticketId, s.user.id);
  } catch (e) {
    return { result: "error", message: (e as Error).message };
  }
}
