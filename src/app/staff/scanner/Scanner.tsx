"use client";
import jsQR from "jsqr";
import { useCallback, useEffect, useRef, useState } from "react";
import { admitById, lookupTickets, scanPayload, type ScanResult } from "@/app/actions/staff";

type Ev = { id: string; title: string; starts_at: string };
const VIEW: Record<ScanResult["result"], { bg: string; title: string; help: string }> = {
  admitted: { bg: "bg-ok", title: "VALID — ADMIT", help: "Check ID if required, then attach a wristband." },
  already_used: { bg: "bg-bad", title: "ALREADY USED", help: "Do not admit. Send to supervisor if they dispute it." },
  wrong_event: { bg: "bg-warn", title: "WRONG EVENT", help: "This ticket is for a different event. Do not admit." },
  cancelled: { bg: "bg-warn", title: "CANCELLED / REFUNDED", help: "Ticket is no longer valid. Do not admit." },
  invalid: { bg: "bg-warn", title: "INVALID TICKET", help: "Not a genuine ticket. Do not admit. Ask for the original ticket link." },
  event_not_active: { bg: "bg-warn", title: "EVENT NOT ACTIVE", help: "This event is cancelled or in draft." },
  error: { bg: "bg-warn", title: "NO RESULT", help: "Could not verify. Do not admit — retry or switch to the backup hotspot." },
};

export function Scanner({ events }: { events: Ev[] }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [camera, setCamera] = useState<"off" | "on" | "denied">("off");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Awaited<ReturnType<typeof lookupTickets>>>([]);
  const video = useRef<HTMLVideoElement>(null), canvas = useRef<HTMLCanvasElement>(null), stream = useRef<MediaStream | null>(null);
  const lock = useRef(false);
  const eventRef = useRef(eventId);
  useEffect(() => { eventRef.current = eventId; }, [eventId]); // camera loop reads the current selection

  useEffect(() => {
    const up = () => setOnline(navigator.onLine);
    up(); window.addEventListener("online", up); window.addEventListener("offline", up);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", up); stream.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  const handle = useCallback(async (fn: () => Promise<ScanResult>) => {
    lock.current = true; setBusy(true);
    try { setResult(await fn()); } catch { setResult({ result: "error" }); }
    setBusy(false);
    if (navigator.vibrate) navigator.vibrate(200);
  }, []);

  const start = async () => {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      video.current!.srcObject = stream.current; await video.current!.play(); setCamera("on");
      const tick = () => {
        if (!stream.current) return;
        const v = video.current!, c = canvas.current!;
        if (!lock.current && v.readyState === v.HAVE_ENOUGH_DATA) {
          c.width = 480; c.height = Math.round((480 * v.videoHeight) / v.videoWidth) || 480;
          const ctx = c.getContext("2d", { willReadFrequently: true })!;
          ctx.drawImage(v, 0, 0, c.width, c.height);
          const code = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: "dontInvert" });
          if (code?.data) void handle(() => scanPayload(eventRef.current, code.data));
        }
        setTimeout(() => requestAnimationFrame(tick), 120);
      };
      tick();
    } catch { setCamera("denied"); }
  };

  const next = () => { setResult(null); setTimeout(() => (lock.current = false), 400); };
  const view = result ? VIEW[result.result] : null;

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      {!online && <div className="rounded-xl bg-bad p-3 text-center text-sm font-bold text-white">OFFLINE — DO NOT ADMIT. Switch to backup hotspot or use the supervisor procedure.</div>}
      <select className="input" value={eventId} onChange={(e) => { setEventId(e.target.value); setResult(null); }}>
        {events.map((e) => <option key={e.id} value={e.id}>{e.title} · {new Date(e.starts_at).toLocaleDateString("en-GB", { timeZone: "Asia/Beirut" })}</option>)}
      </select>
      <div className="relative aspect-square overflow-hidden rounded-3xl border border-line bg-surface">
        <video ref={video} playsInline muted className={`h-full w-full object-cover ${camera === "on" ? "" : "hidden"}`} />
        <canvas ref={canvas} className="hidden" />
        {camera !== "on" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            {camera === "denied" && <p className="text-sm text-warn">Camera permission denied. Allow camera access in browser settings, or use manual lookup below.</p>}
            <button className="btn-primary" onClick={start} disabled={!eventId}>Start camera</button>
          </div>
        )}
        {camera === "on" && <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-accent/80" />}
        {busy && <div className="absolute inset-0 flex items-center justify-center bg-bg/70 text-lg font-bold">Verifying…</div>}
      </div>

      {view && result && (
        <button onClick={next} className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 p-6 text-center text-bg ${view.bg}`}>
          <div className="h-display text-4xl">{view.title}</div>
          {result.is_test && <div className="rounded-full bg-bg px-4 py-1 text-sm font-bold text-warn">SANDBOX TEST TICKET — NOT VALID FOR REAL ENTRY</div>}
          {result.ticket_type && <div className="text-xl font-semibold">{result.ticket_type}</div>}
          {result.attendee_name && <div className="text-lg">{result.attendee_name}</div>}
          {result.result === "already_used" && result.checked_in_at && <div>First checked in {new Date(result.checked_in_at).toLocaleTimeString("en-GB", { timeZone: "Asia/Beirut" })}</div>}
          <p className="max-w-xs text-sm font-medium">{result.message ?? view.help}</p>
          <span className="mt-6 rounded-full bg-bg/90 px-6 py-3 text-sm font-semibold text-fg">Tap to scan next</span>
        </button>
      )}

      <details className="card">
        <summary className="cursor-pointer text-sm font-semibold">Manual lookup (supervisor)</summary>
        <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); setHits(await lookupTickets(eventId, q)); }}>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email or phone" />
          <button className="btn-ghost btn-sm">Search</button>
        </form>
        <ul className="mt-3 space-y-2">{hits.map((h) => (
          <li key={h.id} className="flex items-center justify-between gap-2 rounded-xl border border-line p-3 text-sm">
            <div><div className="font-semibold">{h.name}{h.is_test && <span className="ml-2 text-warn">TEST</span>}</div><div className="text-xs text-muted">{h.type} · {h.email} · {h.status}</div></div>
            {h.status === "valid" && <button className="btn-primary btn-sm" onClick={() => handle(() => admitById(eventId, h.id)).then(() => setHits([]))}>Admit</button>}
          </li>
        ))}</ul>
        <p className="mt-3 text-xs text-muted">Verify ID matches the name before manual admission. Every admission is logged with your account.</p>
      </details>
    </div>
  );
}
