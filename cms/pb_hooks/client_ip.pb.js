/// <reference path="../pb_data/types.d.ts" />
// Works out the visitor's IP once per request (lib/client_ip.js) and puts it in
// X-Grid-Client-IP, the header PocketBase trusts (migration 1791900000). The header is always
// overwritten, so a value sent by a visitor never counts. Runs before the rate limiter
// (priority -1000) and the admin IP check.
routerUse(
  new Middleware(
    (e) => {
      const { HEADER, clientIP } = require(`${__hooks}/lib/client_ip.js`);
      const h = e.request.header;
      h.set(HEADER, clientIP(h.get("X-Forwarded-For"), h.get("CF-Connecting-IP"), e.request.remoteAddr));
      return e.next();
    },
    -99990,
    "gridwatchClientIP",
  ),
);
