"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function EventSelect({ events, current }: { events: { id: string; title: string }[]; current?: string }) {
  const router = useRouter(), path = usePathname(), sp = useSearchParams();
  return (
    <select aria-label="Event" className="input py-2" value={current ?? ""} onChange={(e) => {
      const p = new URLSearchParams(sp); p.set("event", e.target.value); p.delete("page"); router.push(`${path}?${p}`);
    }}>
      {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
    </select>
  );
}
