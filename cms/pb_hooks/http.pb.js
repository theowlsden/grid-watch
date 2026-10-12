/// <reference path="../pb_data/types.d.ts" />
// Public reads of news, sites, island and translations may be cached for about 60 s (spec 7.3),
// also by Cloudflare; signed-in answers never.
routerUse((e) => {
  const path = e.request.url.path;
  if (e.auth && path.startsWith("/api/")) {
    // signed-in answers (drafts for the bot, the admin UI) must never be stored by a CDN
    e.response.header().set("Cache-Control", "private, no-store");
  } else if (e.request.method === "GET" && /^\/api\/collections\/(news|sites|island|translations)\/records/.test(path)) {
    e.response.header().set("Cache-Control", "public, max-age=60");
  }
  return e.next();
});
