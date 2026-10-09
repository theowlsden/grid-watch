/// <reference path="../pb_data/types.d.ts" />
// Step 10: the Telegram bot account must see its drafts (to edit, publish or delete them).
// The public still sees only live items; superusers see everything as before.

const LIVE = 'status = "published" && publishedAt <= @now && (expiresAt = "" || expiresAt > @now)';

migrate(
  (app) => {
    const news = app.findCollectionByNameOrId("news");
    news.listRule = `(${LIVE}) || @request.auth.collectionName = "bots"`;
    news.viewRule = `(${LIVE}) || @request.auth.collectionName = "bots"`;
    app.save(news);
  },
  (app) => {
    const news = app.findCollectionByNameOrId("news");
    news.listRule = LIVE;
    news.viewRule = LIVE;
    app.save(news);
  },
);
