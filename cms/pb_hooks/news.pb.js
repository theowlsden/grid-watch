/// <reference path="../pb_data/types.d.ts" />
// News rules the collection schema cannot express (spec 7.3).
// Note: each handler runs in its own context; shared code is loaded with require() inside it.

onRecordCreateRequest((e) => {
  const { actor, isBot } = require(`${__hooks}/lib/actor.js`);
  e.record.set("author", actor(e));
  e.record.set("updatedBy", actor(e));
  e.record.set("source", isBot(e) ? "telegram" : "ui");
  e.next();
}, "news");

onRecordUpdateRequest((e) => {
  const { actor } = require(`${__hooks}/lib/actor.js`);
  e.record.set("updatedBy", actor(e));
  // author and source describe the original post and cannot be rewritten
  e.record.set("author", e.record.original().get("author"));
  e.record.set("source", e.record.original().get("source"));
  e.next();
}, "news");

onRecordValidate((e) => {
  const link = e.record.getString("link");
  if (link && !link.startsWith("https://")) {
    throw new BadRequestError("Links must use https.");
  }
  // publishing stamps the time unless a (future) time was set on purpose
  if (e.record.getString("status") === "published" && e.record.getDateTime("publishedAt").isZero()) {
    e.record.set("publishedAt", new DateTime());
  }
  e.next();
}, "news");
