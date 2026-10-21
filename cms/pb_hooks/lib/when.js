// Local times for events and notices (Curaçao, UTC-4, no daylight saving). Editors may type
// "2026-10-13", "2026-10-13 14:00" or a full ISO time; stored as a local date, or a local
// date-time with the -04:00 offset, as in data/events (schemas/events.schema.json).
// Loaded with require(`${__hooks}/lib/when.js`) inside a handler.

const pad = (n) => String(n).padStart(2, "0");

/** The value in the stored form, or null when it is not a date or time. "" stays "". */
function normalise(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return valid(+m[1], +m[2], +m[3], 0, 0) ? v : null;
  m = v.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, tz] = m;
  if (!valid(+y, +mo, +d, +h, +mi)) return null;
  if (!tz || tz === "-04:00" || tz === "-0400") return `${y}-${mo}-${d}T${h}:${mi}:${pad(+(s || 0))}-04:00`;
  // another offset: convert to Curaçao time
  const sign = tz === "Z" ? 0 : tz[0] === "-" ? -1 : 1;
  const off = tz === "Z" ? 0 : sign * (+tz.slice(1, 3) * 60 + +tz.slice(-2));
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0)) - off * 60000;
  const l = new Date(utc - 4 * 3600000);
  return `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())}T${pad(l.getUTCHours())}:${pad(l.getUTCMinutes())}:${pad(l.getUTCSeconds())}-04:00`;
}

function valid(y, mo, d, h, mi) {
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d && h < 24 && mi < 60;
}

/** A stored local value as a PocketBase UTC date string ("" for ""); a date is its midnight. */
function toUtc(local) {
  if (!local) return "";
  const v = local.length === 10 ? `${local}T00:00:00-04:00` : local;
  return new Date(v).toISOString().replace("T", " ");
}

/** Milliseconds since 1970 for a stored local value. */
function ms(local) {
  return new Date(local.length === 10 ? `${local}T00:00:00-04:00` : local).getTime();
}

module.exports = { normalise, toUtc, ms };
