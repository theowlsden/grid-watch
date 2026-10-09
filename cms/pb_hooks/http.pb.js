/// <reference path="../pb_data/types.d.ts" />
// Public reads of news, sites and island may be cached for about 60 s (spec 7.3).
routerUse((e) => {
  const path = e.request.url.path;
  if (e.request.method === "GET" && /^\/api\/collections\/(news|sites|island)\/records/.test(path) && !e.auth) {
    e.response.header().set("Cache-Control", "public, max-age=60");
  }
  return e.next();
});
