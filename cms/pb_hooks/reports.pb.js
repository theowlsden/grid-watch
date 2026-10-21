/// <reference path="../pb_data/types.d.ts" />
// Public reports (decision 26). Superusers may add reports freely (e.g. from a phone call);
// everyone else needs a valid Cloudflare Turnstile token, and a filled-in honeypot field gets a
// polite answer while nothing is saved. Status always starts as "new".

onRecordCreateRequest((e) => {
  const { check, verified } = require(`${__hooks}/lib/reports.js`);
  if (!e.hasSuperuserAuth()) {
    const body = e.requestInfo().body || {};
    if (String(body.website || "").trim()) {
      return e.json(200, { status: "received" }); // the honeypot: a bot filled the hidden field
    }
    if (!$os.getenv("TURNSTILE_SECRET")) throw new BadRequestError("Reporting is not open yet.");
    if (!verified(String(body["cf-turnstile-response"] || ""))) throw new BadRequestError("The check that you are not a bot failed; please try again.");
    e.record.set("status", "new");
  } else if (!e.record.getString("status")) {
    e.record.set("status", "new");
  }
  check(e.record);
  e.next();
}, "reports");

// Grouped counts of unverified community reports for the site (never single reports, never
// events): the last `days` days (at most 30), only dates with at least MIN reports.
routerAdd("GET", "/api/gridwatch/community", (e) => {
  const { localToday } = require(`${__hooks}/lib/reports.js`);
  const MIN = 2;
  const days = Math.max(1, Math.min(30, parseInt(e.request.url.query().get("days") || "14", 10) || 14));
  const today = localToday();
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1) * 86400000).toISOString().slice(0, 10);
  const rows = e.app.findRecordsByFilter("reports", 'kind = "community" && status != "spam" && status != "rejected" && date >= {:from}', "-date", 5000, 0, { from });
  const byDate = {};
  for (const r of rows) {
    const key = r.getString("date");
    if (!byDate[key]) byDate[key] = { date: key, total: 0, island: 0, unknown: 0, areas: {} };
    const d = byDate[key];
    d.total++;
    const scope = r.getString("scope");
    if (scope === "island") d.island++;
    else if (scope === "unknown") d.unknown++;
    else {
      let areas = [];
      try {
        areas = JSON.parse(r.getString("areas") || "[]") || [];
      } catch (_) {}
      for (const a of areas) d.areas[a] = (d.areas[a] || 0) + 1;
    }
  }
  const out = Object.values(byDate)
    .filter((d) => d.total >= MIN)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((d) => ({ ...d, areas: Object.entries(d.areas).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1)) }));
  e.response.header().set("Cache-Control", "public, max-age=60");
  return e.json(200, { label: "unverified community reports", min_reports: MIN, days, items: out });
});
