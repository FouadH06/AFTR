import "server-only";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { orderUrl } from "@/lib/keys";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/time";

/** Sends the ticket-link email for a paid order. Safe to call repeatedly (only sends a link, never issues tickets). */
export async function sendTicketEmail(orderId: string) {
  const { data: o } = await supabaseAdmin().from("orders").select("email, full_name, status, is_test, events(title, starts_at)").eq("id", orderId).single();
  if (!o || o.status !== "paid") return;
  const ev = o.events as unknown as { title: string; starts_at: string };
  await sendEmail(o.email, `${o.is_test ? "[TEST] " : ""}Your tickets for ${ev.title}`, [
    `Hi ${o.full_name},`,
    o.is_test ? "This is a SANDBOX test order. These tickets are not valid for entry." : "Your order is confirmed.",
    `${ev.title} — ${fmtDateTime(ev.starts_at)} (Beirut time).`,
    "Each QR code is single-use. Do not share screenshots: the first scan wins.",
  ], { label: "View my tickets", url: env.siteUrl + orderUrl(orderId) });
}

export const ORDER_ERRORS: Record<string, string> = {
  NOT_ON_SALE: "Tickets for this event are not on sale right now.",
  SOLD_OUT: "Sorry — that ticket type just sold out. Try another one.",
  EVENT_CAPACITY: "The event is at capacity.",
  OVER_ORDER_LIMIT: "That's more than the per-order limit for this ticket type.",
  TYPE_UNAVAILABLE: "That ticket type is unavailable.",
  TYPE_NOT_ON_SALE: "That ticket wave isn't on sale right now.",
  INVALID_PROMO: "That promo code isn't valid.",
  PROMO_EXHAUSTED: "That promo code has been fully used.",
  SELF_PROMO: "Promoters can't use their own promo code.",
  NO_ITEMS: "Pick at least one ticket.",
  BAD_QUANTITY: "Invalid quantity.",
};
export const orderError = (msg: string) => ORDER_ERRORS[Object.keys(ORDER_ERRORS).find((k) => msg.includes(k)) ?? ""] ?? "Something went wrong. Please try again.";
