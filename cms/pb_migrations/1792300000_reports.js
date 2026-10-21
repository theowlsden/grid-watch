/// <reference path="../pb_data/types.d.ts" />
// Public reports (decision 26): anyone may send one (after a Cloudflare Turnstile check, see
// pb_hooks/reports.pb.js); nobody but superusers and the bot (for alerts) can read them. A
// sourced report is checked by an editor and turned into an event or notice; an unsourced
// community report is only ever shown as a grouped count (/api/gridwatch/community).
// No names, contact details or IP addresses are stored.
migrate(
  (app) => {
    const reports = new Collection({
      type: "base",
      name: "reports",
      listRule: '@request.auth.collectionName = "bots"',
      viewRule: '@request.auth.collectionName = "bots"',
      createRule: "",
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: "select", name: "kind", required: true, maxSelect: 1, values: ["sourced", "community"] },
        { type: "select", name: "type", required: true, maxSelect: 1, values: ["blackout", "outage", "load_shedding", "shortage", "notice", "other"] },
        { type: "text", name: "date", required: true, max: 10 },
        { type: "text", name: "start_time", max: 5 },
        { type: "text", name: "end_time", max: 5 },
        { type: "bool", name: "ongoing" },
        { type: "select", name: "scope", required: true, maxSelect: 1, values: ["island", "areas", "unknown"] },
        { type: "json", name: "areas", maxSize: 2000 },
        { type: "url", name: "source_url" },
        { type: "text", name: "note", max: 500 },
        { type: "select", name: "status", required: true, maxSelect: 1, values: ["new", "used", "rejected", "spam"] },
        { type: "autodate", name: "created", onCreate: true, onUpdate: false },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE INDEX idx_reports_date ON reports (date)"],
    });
    app.save(reports);

    // at most 5 reports per 10 minutes from one address
    const s = app.settings();
    s.rateLimits.rules = [...s.rateLimits.rules.filter((r) => r.label !== "reports:create"), { label: "reports:create", audience: "@guest", duration: 600, maxRequests: 5 }];
    app.save(s);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("reports"));
    const s = app.settings();
    s.rateLimits.rules = s.rateLimits.rules.filter((r) => r.label !== "reports:create");
    app.save(s);
  },
);
