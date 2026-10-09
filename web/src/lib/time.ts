// All dates and times on the page are Curaçao time (America/Curacao: UTC-4, no daylight saving).
// Weekday and month names come from the message files (date.* keys), not from the browser's Intl
// data, which has no Papiamentu; so every language can show its own names.
export const TZ = "America/Curacao";
const OFFSET_MS = -4 * 3600_000;

export interface DateNames {
  daysShort: string[]; // Sunday first
  daysLong: string[];
  monthsShort: string[]; // January first
  monthsLong: string[];
}

interface Local {
  y: number;
  m: number; // 0-11
  d: number;
  wd: number; // 0 = Sunday
  hh: number;
  mm: number;
}

/** Calendar parts of a YYYY-MM-DD local date. */
function fromYmd(ymd: string): Local {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return { y, m: m - 1, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay(), hh: 0, mm: 0 };
}

/** Calendar parts of an instant, in Curaçao time. */
function fromInstant(iso: string): Local {
  const t = new Date(Date.parse(iso) + OFFSET_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), wd: t.getUTCDay(), hh: t.getUTCHours(), mm: t.getUTCMinutes() };
}

/** Event times are a local date or a local date-time with the -04:00 offset (schema). */
function fromEvent(value: string): Local {
  return value.length === 10 ? fromYmd(value) : fromInstant(value);
}

const pad = (n: number) => String(n).padStart(2, "0");

export function weekdayShort(ymd: string, n: DateNames): string {
  return n.daysShort[fromYmd(ymd).wd];
}

export function weekdayLong(ymd: string, n: DateNames): string {
  return n.daysLong[fromYmd(ymd).wd];
}

export function dayOfMonth(ymd: string): number {
  return fromYmd(ymd).d;
}

export function monthLong(ymd: string, n: DateNames): string {
  return n.monthsLong[fromYmd(ymd).m];
}

// "Wed 7 Oct 2026"
export function dateMedium(ymd: string, n: DateNames): string {
  const p = fromYmd(ymd);
  return `${n.daysShort[p.wd]} ${p.d} ${n.monthsShort[p.m]} ${p.y}`;
}

// "27 Aug 2025"
export function eventDate(value: string, n: DateNames): string {
  const p = fromEvent(value);
  return `${p.d} ${n.monthsShort[p.m]} ${p.y}`;
}

// Event ranges share what they can: "25 to 26 Apr 2026", "30 Aug to 2 Sep 2026".
export function eventRange(start: string, end: string, n: DateNames, join: (a: string, b: string) => string): string {
  const a = fromEvent(start);
  const b = fromEvent(end);
  const full = (p: Local) => `${p.d} ${n.monthsShort[p.m]} ${p.y}`;
  if (a.y !== b.y) return join(full(a), full(b));
  if (a.m !== b.m) return join(`${a.d} ${n.monthsShort[a.m]}`, full(b));
  return join(String(a.d), full(b));
}

// "7 Oct 08:00" for the issue time.
export function issuedShort(iso: string, n: DateNames): string {
  const p = fromInstant(iso);
  return `${p.d} ${n.monthsShort[p.m]} ${pad(p.hh)}:${pad(p.mm)}`;
}

// "9 Oct" for news items (PocketBase dates look like "2026-10-08 12:00:00.000Z").
export function dayMonth(value: string, n: DateNames): string {
  const t = Date.parse(value.replace(" ", "T"));
  if (Number.isNaN(t)) return "";
  const p = fromInstant(new Date(t).toISOString());
  return `${p.d} ${n.monthsShort[p.m]}`;
}
