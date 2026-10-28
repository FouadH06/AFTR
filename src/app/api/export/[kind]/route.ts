import { can, getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

// Neutralise spreadsheet formula injection and quote every cell.
const cell = (v: unknown) => { let s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
const csv = (rows: Record<string, unknown>[], cols: string[]) => [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");

export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const s = await getSession();
  if (!s) return new Response("Forbidden", { status: 403 });
  const db = supabaseAdmin();
  let body: string;
  if (kind === "waitlist") {
    if (!can(s, ["event_manager"])) return new Response("Forbidden", { status: 403 });
    const { data } = await db.from("waitlist_entries").select("full_name, email, phone, instagram, source, created_at").eq("marketing_consent", true).order("created_at");
    body = csv(data ?? [], ["full_name", "email", "phone", "instagram", "source", "created_at"]);
  } else if (kind === "orders") {
    const event = new URL(req.url).searchParams.get("event");
    if (!event || !can(s, ["finance", "event_manager"], event)) return new Response("Forbidden", { status: 403 });
    const { data } = await db.from("orders").select("id, status, full_name, email, phone, subtotal_cents, discount_cents, total_cents, provider, is_test, source, utm, paid_at, refunded_at, created_at").eq("event_id", event).order("created_at");
    body = csv(data ?? [], ["id", "status", "full_name", "email", "phone", "subtotal_cents", "discount_cents", "total_cents", "provider", "is_test", "source", "utm", "paid_at", "refunded_at", "created_at"]);
  } else return new Response("Not found", { status: 404 });
  await db.rpc("audit", { p_actor: s!.user.id, p_action: `export.${kind}`, p_entity: "export", p_entity_id: null, p_data: null });
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${kind}-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}
