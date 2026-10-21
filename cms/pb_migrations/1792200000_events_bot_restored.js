/// <reference path="../pb_data/types.d.ts" />
// The Telegram bot may close an ongoing event: set the end time of a published event, nothing
// else (pb_hooks/events.pb.js resets any other field it sends). It reads the published events
// like everyone else.
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId("events");
    c.updateRule = '@request.auth.collectionName = "bots" && status = "published"';
    app.save(c);
  },
  (app) => {
    const c = app.findCollectionByNameOrId("events");
    c.updateRule = null;
    app.save(c);
  },
);
