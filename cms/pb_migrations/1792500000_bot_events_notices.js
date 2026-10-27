/// <reference path="../pb_data/types.d.ts" />
// The Telegram bot turns public reports into events and notices (decision 29). Its account may
// create event and notice drafts, read and change the drafts it made, publish them (the hooks
// check sources as for everyone) and delete them while they are drafts. A published event stays
// limited to its end time (/restored); a published notice is not the bot's to change.
// On reports the bot may only set the status and link the draft it made (pb_hooks/reports.pb.js).

const BOT = '@request.auth.collectionName = "bots"';
const OWN_DRAFT = `${BOT} && status = "draft" && author ~ "bot:"`;

migrate(
  (app) => {
    for (const name of ["events", "notices"]) {
      const c = app.findCollectionByNameOrId(name);
      c.listRule = `status = "published" || (${BOT} && author ~ "bot:")`;
      c.viewRule = c.listRule;
      c.createRule = BOT;
      c.updateRule = name === "events" ? `${BOT} && (status = "published" || author ~ "bot:")` : OWN_DRAFT;
      c.deleteRule = OWN_DRAFT;
      app.save(c);
    }
    const reports = app.findCollectionByNameOrId("reports");
    reports.updateRule = BOT;
    reports.fields.add(new RelationField({ name: "event", collectionId: app.findCollectionByNameOrId("events").id, maxSelect: 1, cascadeDelete: false }));
    reports.fields.add(new RelationField({ name: "notice", collectionId: app.findCollectionByNameOrId("notices").id, maxSelect: 1, cascadeDelete: false }));
    app.save(reports);
  },
  (app) => {
    for (const name of ["events", "notices"]) {
      const c = app.findCollectionByNameOrId(name);
      c.listRule = 'status = "published"';
      c.viewRule = c.listRule;
      c.createRule = null;
      c.updateRule = name === "events" ? `${BOT} && status = "published"` : null;
      c.deleteRule = null;
      app.save(c);
    }
    const reports = app.findCollectionByNameOrId("reports");
    reports.updateRule = null;
    reports.fields.removeByName("event");
    reports.fields.removeByName("notice");
    app.save(reports);
  },
);
