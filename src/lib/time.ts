// All event times are stored as UTC timestamptz and displayed/entered in Asia/Beirut (DST-aware).
export const TZ = "Asia/Beirut";

function offsetMinutes(utcMs: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - utcMs) / 60000);
}

/** "2026-11-14T22:00" (Beirut wall clock) -> ISO UTC string. Returns null for empty/invalid input. */
export function beirutToUtc(local: string | null | undefined): string | null {
  const m = local?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let utc = naive - offsetMinutes(naive) * 60000;
  utc = naive - offsetMinutes(utc) * 60000; // second pass settles DST boundaries
  return new Date(utc).toISOString();
}

/** ISO UTC -> "YYYY-MM-DDTHH:mm" in Beirut, for <input type="datetime-local">. */
export function utcToBeirutInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime();
  return new Date(ms + offsetMinutes(ms) * 60000).toISOString().slice(0, 16);
}

export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" }): string {
  return iso ? new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...opts }).format(new Date(iso)) : "TBA";
}
export const fmtTime = (iso: string | null | undefined) => fmtDate(iso, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export const fmtDateTime = (iso: string | null | undefined) => fmtDate(iso, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Beirut calendar day key, e.g. "2026-11-14". */
export const beirutDay = (iso: string) => utcToBeirutInput(iso).slice(0, 10);
