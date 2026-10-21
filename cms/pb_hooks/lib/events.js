// Rules for events and notices that the collection schema cannot express (pb_hooks/events.pb.js).
// Loaded with require(`${__hooks}/lib/events.js`) inside a handler: PocketBase runs each handler
// in its own context, so top-level functions in a hook file are not visible to it.

function prepare(e, kind) {
  const { normalise, toUtc, ms } = require(`${__hooks}/lib/when.js`);
  const r = e.record;
  const bad = (field, why) => {
    throw new BadRequestError(`${field}: ${why}`);
  };
  const time = (field, required) => {
    const v = normalise(r.getString(field));
    if (v === null) bad(field, 'use a date like 2026-10-13 or a time like 2026-10-13 14:00 (Curaçao time)');
    if (required && !v) bad(field, "required");
    r.set(field, v);
    return v;
  };
  const scope = r.getString("scope");
  // a json field comes back as raw bytes; its text form is the JSON itself ("" or "null" when empty)
  let areas;
  try {
    const raw = r.getString("areas").trim();
    areas = !raw || raw === "null" ? [] : JSON.parse(raw);
  } catch (_) {
    bad("areas", 'a list of neighbourhood names, e.g. ["Punda", "Otrobanda"]');
  }
  if (!Array.isArray(areas) || areas.some((a) => typeof a !== "string" || !a.trim())) bad("areas", "a list of neighbourhood names");
  areas = Array.from(new Set(areas.map((a) => a.trim())));
  r.set("areas", areas);
  if (scope === "areas" && !areas.length) bad("areas", 'list the neighbourhoods when the scope is "areas"');
  if (scope !== "areas" && areas.length) bad("scope", 'set the scope to "areas" when neighbourhoods are listed');

  // a free slug: the base, else base-2, base-3, ... (two notices on one day are normal)
  const freeSlug = (base) => {
    for (let i = 1; i < 100; i++) {
      const candidate = i === 1 ? base : `${base}-${i}`;
      try {
        e.app.findFirstRecordByFilter(kind, "slug = {:s} && id != {:id}", { s: candidate, id: r.id || "" });
      } catch (_) {
        return candidate; // not found: free
      }
    }
    bad("slug", "could not find a free id; set one by hand");
  };

  const published = r.getString("status") === "published";
  const slugDate = (v) => v.slice(0, 10);
  if (kind === "events") {
    const start = time("start_local", true);
    const end = time("end_local", false);
    if (end && ms(end) < ms(start)) bad("end_local", "is before the start");
    r.set("startsAt", toUtc(start));
    r.set("endsAt", end ? toUtc(end) : "");
    for (const f of ["source_published", "source_retrieved"]) time(f, false);
    if (!r.getString("source_retrieved") && r.getString("source_url")) r.set("source_retrieved", new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 10));
    if (!r.getString("slug")) r.set("slug", freeSlug(`${slugDate(start)}-${r.getString("type").replace(/_/g, "-")}`));
    if (published) {
      for (const f of ["source_publisher", "source_title", "source_url", "source_published"]) if (!r.getString(f)) bad(f, "needed before publishing (spec 4.6: every event links to its source)");
    }
  } else {
    const at = time("published_local", true);
    const starts = time("starts_local", false);
    const ends = time("ends_local", false);
    const expires = time("expires_local", false);
    if (starts && ends && ms(ends) < ms(starts)) bad("ends_local", "is before the start");
    const exp = expires ? ms(expires) : ends ? ms(ends) + 2 * 3600000 : starts ? ms(starts) + 12 * 3600000 : ms(at) + 24 * 3600000;
    r.set("expiresAt", new Date(exp).toISOString().replace("T", " "));
    if (!r.getString("slug")) r.set("slug", freeSlug(`${slugDate(at)}-${r.getString("announced").replace(/_/g, "-")}`));
    if (published && !r.getString("source_url")) bad("source_url", "needed before publishing: the notice itself");
  }
  // an id set by hand must start with its date, as in data/events (validate.py)
  const own = kind === "events" ? r.getString("start_local") : r.getString("published_local");
  if (r.getString("slug").slice(0, 10) !== own.slice(0, 10)) bad("slug", `must start with ${own.slice(0, 10)}`);
  const url = r.getString("source_url");
  if (url && !url.startsWith("https://")) bad("source_url", "must use https");
}

module.exports = { prepare };
