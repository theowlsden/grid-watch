/// <reference path="../pb_data/types.d.ts" />
// Events and notices move into the CMS (spec 8.4; event vs notice model, 21 Oct 2026).
//   events:  what happened (blackout, outage, load shedding, shortage), with scope, cause and
//            times; scored against the outlook when supply-related.
//   notices: what the utility (or another official source) announced may or will happen.
// Both need a public source before they can be published. Only superusers write for now; the
// public reads published records. data/events/*.yaml is the stored copy
// (pipeline/tools/export_events.py). The seed events from events.yaml are imported as drafts:
// they still need their sources.

const SLUG = "^\\d{4}-\\d{2}-\\d{2}-[a-z0-9-]+$";
const SCOPE = ["island", "areas", "unknown"];
const SEEDS = [
  {
    "id": "2025-08-27-blackout",
    "title": "Island-wide blackout",
    "start_local": "2025-08-27T02:30:00-04:00",
    "end_local": null,
    "type": "blackout",
    "severity": "major",
    "scope": "island",
    "cause": "supply",
    "drivers": [
      "wind_drop"
    ],
    "summary": "Wind output fell sharply around 02:30 and the disturbance grew into a full system collapse. Investigated by Aqualectra and DNV."
  },
  {
    "id": "2026-04-25-outage",
    "title": "Major outage",
    "start_local": "2026-04-25",
    "end_local": "2026-04-26",
    "type": "outage",
    "severity": "major",
    "scope": "unknown",
    "cause": "supply",
    "drivers": [
      "maintenance",
      "high_demand",
      "battery_reliance",
      "capacity_shortfall"
    ],
    "summary": "Units in maintenance, higher evening demand, reliance on battery storage and not enough generation, so customers were switched off."
  },
  {
    "id": "2026-08-15-switching",
    "title": "Controlled switching",
    "start_local": "2026-08-15",
    "end_local": null,
    "type": "load_shedding",
    "severity": "minor",
    "scope": "unknown",
    "cause": "supply",
    "drivers": [
      "wind_drop",
      "heat",
      "high_demand",
      "maintenance",
      "battery_reliance"
    ],
    "summary": "Wind dropped earlier than expected, high temperatures raised demand and some capacity was in maintenance."
  },
  {
    "id": "2026-08-18-shortage",
    "title": "Supply shortage",
    "start_local": "2026-08-18",
    "end_local": "2026-08-19",
    "type": "shortage",
    "severity": "minor",
    "scope": "unknown",
    "cause": "supply",
    "drivers": [
      "wind_drop",
      "capacity_shortfall",
      "maintenance"
    ],
    "summary": "Strongly reduced wind and too little available generation."
  },
  {
    "id": "2026-10-06-controlled-outages",
    "title": "Controlled outages",
    "start_local": "2026-10-06",
    "end_local": null,
    "type": "load_shedding",
    "severity": "minor",
    "scope": "unknown",
    "cause": "supply",
    "drivers": [
      "capacity_shortfall",
      "maintenance",
      "wind_drop"
    ],
    "summary": "Insufficient available capacity, units under repair and very low wind speeds."
  }
];

migrate(
  (app) => {
    const notices = new Collection({
      type: "base",
      name: "notices",
      listRule: 'status = "published"',
      viewRule: 'status = "published"',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: "text", name: "slug", max: 80, pattern: SLUG, presentable: true },
        { type: "text", name: "title", max: 200 },
        { type: "text", name: "publisher", required: true, max: 120 },
        { type: "select", name: "announced", required: true, maxSelect: 1, values: ["load_shedding", "possible_shortage", "maintenance", "other"] },
        { type: "select", name: "scope", required: true, maxSelect: 1, values: SCOPE },
        { type: "json", name: "areas", maxSize: 4000 },
        { type: "text", name: "published_local", required: true, max: 32 },
        { type: "text", name: "starts_local", max: 32 },
        { type: "text", name: "ends_local", max: 32 },
        { type: "text", name: "expires_local", max: 32 },
        { type: "text", name: "summary_en", required: true, max: 1000 },
        { type: "text", name: "summary_pap", max: 1000 },
        { type: "text", name: "source_title", max: 300 },
        { type: "url", name: "source_url" },
        { type: "select", name: "status", required: true, maxSelect: 1, values: ["draft", "published"] },
        { type: "date", name: "expiresAt" },
        { type: "text", name: "author", max: 120 },
        { type: "text", name: "updatedBy", max: 120 },
        { type: "autodate", name: "created", onCreate: true, onUpdate: false },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_notices_slug ON notices (slug) WHERE slug != ''"],
    });
    app.save(notices);

    const events = new Collection({
      type: "base",
      name: "events",
      listRule: 'status = "published"',
      viewRule: 'status = "published"',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: "text", name: "slug", max: 80, pattern: SLUG, presentable: true },
        { type: "text", name: "title", max: 200 },
        { type: "select", name: "type", required: true, maxSelect: 1, values: ["blackout", "outage", "load_shedding", "shortage"] },
        { type: "select", name: "severity", required: true, maxSelect: 1, values: ["major", "minor"] },
        { type: "select", name: "scope", required: true, maxSelect: 1, values: SCOPE },
        { type: "json", name: "areas", maxSize: 4000 },
        { type: "select", name: "cause", required: true, maxSelect: 1, values: ["supply", "network", "unknown"] },
        { type: "select", name: "drivers", maxSelect: 6, values: ["wind_drop", "heat", "high_demand", "maintenance", "capacity_shortfall", "battery_reliance"] },
        { type: "text", name: "start_local", required: true, max: 32 },
        { type: "text", name: "end_local", max: 32 },
        { type: "text", name: "summary_en", required: true, max: 1000 },
        { type: "text", name: "summary_pap", max: 1000 },
        { type: "text", name: "source_publisher", max: 120 },
        { type: "text", name: "source_title", max: 300 },
        { type: "url", name: "source_url" },
        { type: "text", name: "source_published", max: 32 },
        { type: "text", name: "source_retrieved", max: 32 },
        { type: "json", name: "more_sources", maxSize: 8000 },
        { type: "relation", name: "notice", collectionId: notices.id, maxSelect: 1, cascadeDelete: false },
        { type: "select", name: "status", required: true, maxSelect: 1, values: ["draft", "published"] },
        { type: "bool", name: "verified" },
        { type: "date", name: "startsAt" },
        { type: "date", name: "endsAt" },
        { type: "text", name: "author", max: 120 },
        { type: "text", name: "updatedBy", max: 120 },
        { type: "autodate", name: "created", onCreate: true, onUpdate: false },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_events_slug ON events (slug) WHERE slug != ''", "CREATE INDEX idx_events_start ON events (startsAt)"],
    });
    app.save(events);

    // the seed list from events.yaml, as drafts until their sources are filled in
    const { normalise, toUtc } = require(`${__hooks}/lib/when.js`);
    for (const s of SEEDS) {
      const r = new Record(events);
      r.set("slug", s.id);
      r.set("title", s.title || "");
      r.set("type", s.type);
      r.set("severity", s.severity);
      r.set("scope", s.scope);
      r.set("cause", s.cause);
      r.set("drivers", s.drivers || []);
      r.set("start_local", normalise(s.start_local));
      r.set("end_local", s.end_local ? normalise(s.end_local) : "");
      r.set("startsAt", toUtc(normalise(s.start_local)));
      if (s.end_local) r.set("endsAt", toUtc(normalise(s.end_local)));
      r.set("summary_en", s.summary);
      r.set("status", "draft");
      r.set("author", "events.yaml");
      app.saveNoValidate(r);
    }
  },
  (app) => {
    for (const name of ["events", "notices"]) app.delete(app.findCollectionByNameOrId(name));
  },
);
