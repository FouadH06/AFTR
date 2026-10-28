import QRCode from "qrcode";
import { env } from "@/lib/env";
import { checkOrderKey } from "@/lib/keys";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ticketPayload } from "@/lib/tokens";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = new URL(req.url);
  const orderId = u.searchParams.get("o") ?? "";
  if (!checkOrderKey(orderId, u.searchParams.get("k"))) return new Response("Forbidden", { status: 403 });
  const { data: t } = await supabaseAdmin().from("tickets").select("id").eq("id", id).eq("order_id", orderId).eq("status", "valid").maybeSingle();
  if (!t) return new Response("Not found", { status: 404 });
  const png = await QRCode.toBuffer(ticketPayload(env.signingSecret, t.id), { width: 720, margin: 2 });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="ticket-${id.slice(0, 8)}.png"`, "Cache-Control": "private, no-store" } });
}
