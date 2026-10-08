// All dates and times shown on the page use the America/Curacao zone (UTC-4, no daylight saving).
export const TZ = "America/Curacao";

// A forecast date (YYYY-MM-DD) is a local calendar date: anchor it at local noon so
// formatting in America/Curacao can never shift it to another day.
function localDate(ymd: string): Date {
  return new Date(`${ymd}T12:00:00-04:00`);
}

function fmt(d: Date, locale: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, { timeZone: TZ, ...opts }).format(d);
}

export function weekdayShort(ymd: string, locale: string): string {
  return fmt(localDate(ymd), locale, { weekday: "short" });
}

export function weekdayLong(ymd: string, locale: string): string {
  return fmt(localDate(ymd), locale, { weekday: "long" });
}

export function dayOfMonth(ymd: string): number {
  return Number(ymd.slice(8, 10));
}

export function monthLong(ymd: string, locale: string): string {
  return fmt(localDate(ymd), locale, { month: "long" });
}

function parts(d: Date, locale: string, opts: Intl.DateTimeFormatOptions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat(locale, { timeZone: TZ, ...opts }).formatToParts(d)) out[p.type] = p.value;
  return out;
}

// "Wed 7 Oct 2026" (built from parts: some locales add a comma after the weekday)
export function dateMedium(ymd: string, locale: string): string {
  const p = parts(localDate(ymd), locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return `${p.weekday} ${p.day} ${p.month} ${p.year}`;
}

function eventDay(value: string): Date {
  return value.length === 10 ? localDate(value) : new Date(value);
}

// Event dates: either a date or a date-time with offset; "27 Aug 2025".
export function eventDate(value: string, locale: string): string {
  const p = parts(eventDay(value), locale, { day: "numeric", month: "short", year: "numeric" });
  return `${p.day} ${p.month} ${p.year}`;
}

// Event ranges share what they can: "25 to 26 Apr 2026", "30 Aug to 2 Sep 2026".
export function eventRange(start: string, end: string, locale: string, join: (a: string, b: string) => string): string {
  const a = parts(eventDay(start), locale, { day: "numeric", month: "short", year: "numeric" });
  const b = parts(eventDay(end), locale, { day: "numeric", month: "short", year: "numeric" });
  if (a.year !== b.year) return join(`${a.day} ${a.month} ${a.year}`, `${b.day} ${b.month} ${b.year}`);
  if (a.month !== b.month) return join(`${a.day} ${a.month}`, `${b.day} ${b.month} ${b.year}`);
  return join(a.day, `${b.day} ${b.month} ${b.year}`);
}

// "7 Oct 08:00" for the issue time.
export function issuedShort(iso: string, locale: string): string {
  return fmt(new Date(iso), locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}
