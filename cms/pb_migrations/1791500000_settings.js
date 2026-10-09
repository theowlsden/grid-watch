/// <reference path="../pb_data/types.d.ts" />
// App settings (spec 7.3, 9): privacy-friendly logs, rate limits, and the real client IP
// behind Coolify's proxy so rate limiting counts visitors, not the proxy.
migrate((app) => {
  const s = app.settings();
  s.meta.appName = "Grid Watch CMS";

  // no visitor IP addresses in the request log (spec 9, privacy); keep a week of logs
  s.logs.logIP = false;
  s.logs.maxDays = 7;

  // Traefik (Coolify) appends the client IP to X-Forwarded-For; trust the right-most value
  s.trustedProxy.headers = ["X-Forwarded-For"];
  s.trustedProxy.useLeftmostIP = false;

  s.batch.enabled = false;

  s.rateLimits.enabled = true;
  s.rateLimits.rules = [
    { label: "*:auth", audience: "", duration: 3, maxRequests: 2 },
    { label: "*:create", audience: "", duration: 5, maxRequests: 20 },
    { label: "/api/", audience: "@guest", duration: 10, maxRequests: 120 },
    { label: "/api/", audience: "@auth", duration: 10, maxRequests: 300 },
  ];
  app.save(s);
});
