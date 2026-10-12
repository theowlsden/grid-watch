/// <reference path="../pb_data/types.d.ts" />
// Rate limits and the admin IP check read the visitor's IP from X-Grid-Client-IP, which
// pb_hooks/client_ip.pb.js sets on every request (Cloudflare-aware, cannot be faked).
migrate(
  (app) => {
    const s = app.settings();
    s.trustedProxy.headers = ["X-Grid-Client-IP"];
    s.trustedProxy.useLeftmostIP = false;
    app.save(s);
  },
  (app) => {
    const s = app.settings();
    s.trustedProxy.headers = ["X-Forwarded-For"];
    s.trustedProxy.useLeftmostIP = false;
    app.save(s);
  },
);
