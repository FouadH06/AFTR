"use client";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className = "btn-primary", pendingText = "Working…" }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={className}>{pending ? pendingText : children}</button>;
}

/** Submit button that asks for confirmation first (destructive actions). */
export function ConfirmButton({ children, message, className = "btn-danger btn-sm" }: { children: React.ReactNode; message: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className} onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}>
      {pending ? "…" : children}
    </button>
  );
}

export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn-ghost btn-sm" onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}>
      {done ? "Copied ✓" : label}
    </button>
  );
}

export function Countdown({ to }: { to: string }) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const diff = Math.max(0, target - (now ?? target));
  const parts = [["Days", 86400000], ["Hrs", 3600000], ["Min", 60000], ["Sec", 1000]].map(([l, ms], i, arr) => {
    const prev = i === 0 ? Infinity : (arr[i - 1][1] as number);
    return [l, Math.floor((diff % prev) / (ms as number))] as const;
  });
  return (
    <div className="flex gap-2 sm:gap-3" aria-label="Countdown" suppressHydrationWarning>
      {parts.map(([l, v]) => (
        <div key={l} className="min-w-16 rounded-xl border border-line bg-surface/70 px-3 py-2 text-center backdrop-blur">
          <div className="h-display text-2xl tabular-nums sm:text-3xl">{now === null ? "--" : String(v).padStart(2, "0")}</div>
          <div className="text-[10px] uppercase tracking-widest text-muted">{l}</div>
        </div>
      ))}
    </div>
  );
}
