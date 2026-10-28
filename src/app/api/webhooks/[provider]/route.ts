import { z } from "zod";
import { env } from "@/lib/env";
import { sendTicketEmail } from "@/lib/orders";
import { getProvider } from "@/lib/payments";
import { supabaseAdmin } from "@/lib/supabase/server";
import { verifyWebhook } from "@/lib/tokens";

const body = z.object({ id: z.string().min(1).max(100), order_id: z.uuid(), status: z.enum(["paid", "failed"]), txn_id: z.string().min(1).max(100), amount_cents: z.number().int(), fee_cents: z.number().int().default(0) });

/**
 * Payment webhooks. Only the sandbox format is implemented (HMAC "t=..,v1=.." header, 5-min replay window,
 * event-id dedupe). Real providers must add their own verification here per their official docs.
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const p = getProvider(provider);
  if (!p || !p.configured()) return new Response("Provider not configured", { status: 404 });
  if (provider !== "sandbox") return new Response("Not implemented", { status: 501 });

  const raw = await req.text();
  if (!verifyWebhook(env.sandboxWebhookSecret, req.headers.get("x-signature"), raw)) return new Response("Bad signature", { status: 401 });
  let evt: z.infer<typeof body>;
  try { evt = body.parse(JSON.parse(raw)); } catch { return new Response("Bad payload", { status: 400 }); }

  const db = supabaseAdmin();
  const { error: dupe } = await db.from("webhook_events").insert({ provider, external_id: evt.id });
  if (dupe?.code === "23505") return Response.json({ ok: true, duplicate: true });
  if (dupe) return new Response("Storage error", { status: 500 });

  if (evt.status === "failed") {
    await db.rpc("fail_order", { p_order: evt.order_id, p_reason: "Provider reported failure" });
    return Response.json({ ok: true });
  }
  const { data, error } = await db.rpc("confirm_payment", { p_order: evt.order_id, p_provider: provider, p_txn: evt.txn_id, p_amount_cents: evt.amount_cents, p_fee_cents: evt.fee_cents, p_raw: evt });
  if (error) {
    await db.from("webhook_events").delete().eq("provider", provider).eq("external_id", evt.id); // allow provider retry
    return new Response("Processing error", { status: 500 });
  }
  if (data === "paid") await sendTicketEmail(evt.order_id);
  return Response.json({ ok: true, result: data });
}
