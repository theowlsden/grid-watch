// Checks for public reports (decision 26). Loaded with require(`${__hooks}/lib/reports.js`)
// inside a handler. PB_NEIGHBOURHOODS points at data/neighbourhoods.json (OpenStreetMap names).

const FIRST_DATE = "2025-01-01";

function localToday() {
  return new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 10);
}

let names = null;
function neighbourhoods() {
  if (names) return names;
  names = {};
  try {
    const file = $os.getenv("PB_NEIGHBOURHOODS") || "/pb/seed/neighbourhoods.json";
    for (const n of JSON.parse(toString($os.readFile(file))).neighbourhoods) names[n.name.toLowerCase()] = n.name;
  } catch (_) {
    names = null; // no list: area names are accepted as typed (trimmed)
    return {};
  }
  return names;
}

/** Throws a BadRequestError with a short reason, or returns the cleaned area names. */
function check(r) {
  const bad = (why) => {
    throw new BadRequestError(why);
  };
  const date = r.getString("date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) bad("date: use YYYY-MM-DD");
  const today = localToday();
  if (date < FIRST_DATE || date > today) bad(`date: between ${FIRST_DATE} and today`);
  for (const f of ["start_time", "end_time"]) {
    const v = r.getString(f);
    if (v && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) bad(`${f}: use HH:MM`);
  }
  if (r.getBool("ongoing")) r.set("end_time", "");
  const st = r.getString("start_time"), en = r.getString("end_time");
  if (st && en && en < st) bad("end_time: before the start (an event past midnight: report the end separately)");
  let areas;
  try {
    const raw = r.getString("areas").trim();
    areas = !raw || raw === "null" ? [] : JSON.parse(raw);
  } catch (_) {
    bad("areas: a list of neighbourhood names");
  }
  if (!Array.isArray(areas) || areas.length > 30 || areas.some((a) => typeof a !== "string")) bad("areas: a list of neighbourhood names");
  const known = neighbourhoods();
  const hasList = Object.keys(known).length > 0;
  const clean = [];
  for (const a of areas) {
    const k = a.trim().toLowerCase();
    if (!k) continue;
    if (hasList && !known[k]) bad(`areas: unknown neighbourhood "${a.trim()}"`);
    const name = hasList ? known[k] : a.trim();
    if (!clean.includes(name)) clean.push(name);
  }
  r.set("areas", clean);
  const scope = r.getString("scope");
  if (scope === "areas" && !clean.length) bad("areas: pick at least one neighbourhood");
  if (scope !== "areas" && clean.length) r.set("areas", []);
  const url = r.getString("source_url");
  if (url && !url.startsWith("https://")) bad("source_url: must use https");
  if (r.getString("kind") === "sourced" && !url) bad("source_url: a sourced report needs the link");
  r.set("note", r.getString("note").trim().slice(0, 500));
  return clean;
}

/** Cloudflare Turnstile: true when the token is valid. TURNSTILE_VERIFY_URL is for tests. */
function verified(token) {
  const secret = $os.getenv("TURNSTILE_SECRET");
  if (!secret || !token) return false;
  const res = $http.send({
    url: $os.getenv("TURNSTILE_VERIFY_URL") || "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    method: "POST",
    body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    timeout: 10,
  });
  return res.statusCode === 200 && res.json && res.json.success === true;
}

module.exports = { check, verified, localToday };
