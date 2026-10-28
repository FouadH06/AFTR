import QRCode from "qrcode";
import { Notice, StatusBadge } from "@/components/ui";
import { env } from "@/lib/env";
import { checkOrderKey } from "@/lib/keys";
import { usd } from "@/lib/money";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/time";
import { ticketPayload } from "@/lib/tokens";

export const dynamic = "force-dynamic";
export const metadata = { title: "My tickets", robots: { index: false } };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ k?: string }> }) {
  const [{ id }, { k }] = await Promise.all([params, searchParams]);
  if (!checkOrderKey(id, k)) return <div className="mx-auto max-w-xl p-6"><Notice tone="bad">Invalid ticket link.</Notice></div>;
  const db = supabaseAdmin();
  const { data: o } = await db.from("orders").select("*, events(title, slug, starts_at, ends_at, area, venue_public, event_venues(venue_name, address))").eq("id", id).single();
  if (!o) return <div className="mx-auto max-w-xl p-6"><Notice tone="bad">Order not found.</Notice></div>;
  const ev = o.events as { title: string; starts_at: string; ends_at: string; area: string | null; venue_public: boolean; event_venues: { venue_name: string | null; address: string | null } | null };
  const { data: tickets } = await db.from("tickets").select("id, status, attendee_name, checked_in_at, ticket_types(name)").eq("order_id", id).order("created_at");
  const qrs = await Promise.all((tickets ?? []).map((t) =>
    QRCode.toString(ticketPayload(env.signingSecret, t.id), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#08080B", light: "#FFFFFF" } })));
  const venue = ev.venue_public && ev.event_venues?.venue_name ? `${ev.event_venues.venue_name}${ev.event_venues.address ? `, ${ev.event_venues.address}` : ""}` : `${ev.area ?? "Beirut"} — location revealed before the event`;

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-10">
      {o.is_test && <Notice>TEST ORDER (sandbox). These tickets are not valid for entry.</Notice>}
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-accent">{fmtDate(ev.starts_at)} · {fmtTime(ev.starts_at)}</p>
        <h1 className="h-display mt-2 text-3xl">{ev.title}</h1>
        <p className="mt-1 text-sm text-muted">{venue}</p>
        <div className="mt-3 flex items-center gap-2 text-sm"><StatusBadge s={o.status} /><span className="text-muted">Order {id.slice(0, 8)} · {usd(o.total_cents)}</span></div>
      </div>
      {o.status === "pending" && <Notice>Awaiting payment confirmation. This page updates once the payment is verified.</Notice>}
      {o.status === "failed" && <Notice tone="bad">Payment failed. No tickets were issued.</Notice>}
      {o.status === "refund_required" && <Notice tone="bad">We received your payment but could not issue tickets ({o.note}). Our team will refund you.</Notice>}
      {(tickets ?? []).map((t, i) => (
        <div key={t.id} className="overflow-hidden rounded-3xl border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-dashed border-line px-5 py-3 text-sm">
            <span className="font-semibold">{(t.ticket_types as unknown as { name: string }).name}</span><StatusBadge s={t.status} />
          </div>
          <div className="space-y-3 p-5">
            {t.status === "valid"
              ? <div className="mx-auto w-full max-w-64 rounded-2xl bg-white p-2" dangerouslySetInnerHTML={{ __html: qrs[i] }} aria-label="Ticket QR code" />
              : <p className="text-center text-sm text-muted">{t.status === "used" ? `Checked in ${fmtDateTime(t.checked_in_at)}` : "This ticket is no longer valid."}</p>}
            <p className="text-center text-sm">{t.attendee_name} · Ticket {i + 1} of {tickets!.length}</p>
            {t.status === "valid" && <a className="btn-ghost btn-sm mx-auto flex w-fit" href={`/api/tickets/${t.id}?o=${id}&k=${k}`} download>Download QR</a>}
          </div>
        </div>
      ))}
      {!!tickets?.length && (
        <div className="card space-y-1 text-sm text-muted">
          <p className="font-semibold text-fg">At the door</p>
          <p>• Each QR is single-use. The first scan is admitted — don&apos;t post or share it.</p>
          <p>• Bring a valid ID matching the ticket name. After scanning you&apos;ll get a wristband: keep it on all night.</p>
          <p>• Turn up your screen brightness. Keep this link private.</p>
        </div>
      )}
    </div>
  );
}
