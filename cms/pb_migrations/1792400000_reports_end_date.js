/// <reference path="../pb_data/types.d.ts" />
// Reports get an end date, so load shedding from 21:00 to 12:00 the next day can be reported
// as one report (pb_hooks/lib/reports.js). Empty means the same day as the start.
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId("reports");
    c.fields.add(new TextField({ name: "end_date", max: 10 }));
    app.save(c);
  },
  (app) => {
    const c = app.findCollectionByNameOrId("reports");
    c.fields.removeByName("end_date");
    app.save(c);
  },
);
