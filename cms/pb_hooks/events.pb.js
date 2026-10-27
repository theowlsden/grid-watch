/// <reference path="../pb_data/types.d.ts" />
// Events and notices (spec 8.4): rules the collection schema cannot express.
//   - times typed as "2026-10-13" or "2026-10-13 14:00" are stored as Curaçao time;
//   - the slug (id) is made from the date and type when left empty;
//   - publishing needs a public https source, sensible times, and areas exactly when the
//     scope is "areas";
//   - a notice expires on its own: 2 h after the announced end, 12 h after the announced start,
//     or 24 h after it was published, unless an expiry is set;
//   - the Telegram bot creates drafts only, and changes a published event's end time only.
// Each handler runs in its own context, so the rules live in lib/events.js.

onRecordValidate((e) => {
  require(`${__hooks}/lib/events.js`).prepare(e, "events");
  e.next();
}, "events");

onRecordValidate((e) => {
  require(`${__hooks}/lib/events.js`).prepare(e, "notices");
  e.next();
}, "notices");

onRecordCreateRequest((e) => {
  const { actor, isBot } = require(`${__hooks}/lib/actor.js`);
  // the bot starts drafts only; publishing is a separate, confirmed step (decision 29)
  if (isBot(e)) e.record.set("status", "draft");
  e.record.set("author", actor(e));
  e.record.set("updatedBy", actor(e));
  e.next();
}, "events", "notices");

onRecordUpdateRequest((e) => {
  const { actor, isBot } = require(`${__hooks}/lib/actor.js`);
  const before = e.record.original();
  if (isBot(e) && before.getString("status") === "published") {
    // on a published event the bot may only add or correct the end time (/restored); its own
    // drafts it may edit and publish (the collection rules allow nothing else)
    const end = e.record.get("end_local");
    for (const f of e.record.collection().fields) {
      if (f.name !== "id") e.record.set(f.name, before.get(f.name));
    }
    e.record.set("end_local", end);
  }
  e.record.set("updatedBy", actor(e));
  e.record.set("author", before.get("author"));
  e.next();
}, "events", "notices");
