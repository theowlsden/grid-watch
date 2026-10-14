// Load test for the live site: simulated visitors loading the dashboard (k6, https://k6.io).
// Read-only: only the public requests a browser makes; never sign-ins or writes.
//
//   export SITE="-e BASE_URL=https://grid.example.org -e CMS_URL=https://cms.grid.example.org"
//   k6 run $SITE tools/loadtest/visit.js                     # the default ramp, up to 200 visitors
//   k6 run $SITE -e PROFILE=smoke tools/loadtest/visit.js    # 1 visitor for 30 s: check the script
//   k6 run $SITE -e PROFILE=spike tools/loadtest/visit.js    # a sudden burst, e.g. a viral post
//   k6 run $SITE -e PROFILE=soak  tools/loadtest/visit.js    # 60 visitors for 20 min
//
// Environment: BASE_URL and CMS_URL (required), PAP_SHARE (share of visitors in Papiamentu, default 0.3),
// NEW_SHARE (share of first-time visitors who download the scripts and fonts, default 0.3).
// See tools/loadtest/README.md before running it against the live site.

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// No defaults on purpose: a copy of this repository must never load-test someone else's site.
if (!__ENV.BASE_URL || !__ENV.CMS_URL) {
  throw new Error("set BASE_URL and CMS_URL, e.g. -e BASE_URL=https://grid.example.org -e CMS_URL=https://cms.grid.example.org");
}
const BASE = __ENV.BASE_URL.replace(/\/+$/, "");
const CMS = __ENV.CMS_URL.replace(/\/+$/, "");
const PAP_SHARE = Number(__ENV.PAP_SHARE ?? 0.3);
const NEW_SHARE = Number(__ENV.NEW_SHARE ?? 0.3);
const PARAMS = { headers: { "User-Agent": "GridWatchLoadTest/1 (k6; +https://github.com/theowlsden/grid-watch)" } };

// the same URLs the site requests (web/src/lib/news.ts, data.ts, translations.ts)
const CMS_REQUESTS = [
  ["news", `${CMS}/api/collections/news/records?perPage=20&sort=-pinned,-publishedAt&fields=id,title_en,title_pap,body_en,body_pap,severity,link,pinned,publishedAt,expiresAt`],
  ["sites", `${CMS}/api/collections/sites/records?perPage=200&sort=sortOrder`],
  ["island", `${CMS}/api/collections/island/records?perPage=1&sort=-updated`],
];
const TRANSLATIONS = `${CMS}/api/collections/translations/records?perPage=1000&skipTotal=1&fields=key,pap`;

const visitTime = new Trend("visit_duration", true);
// The CMS allows each IP 120 requests per 10 s. A test from one machine is one IP, so above about
// 35 visitors the CMS answers 429 by design. Those are counted here, not as failures (README).
const cmsLimited = new Rate("cms_rate_limited");
const CMS_PARAMS = { ...PARAMS, responseCallback: http.expectedStatuses({ min: 200, max: 399 }, 429) };

const PROFILES = {
  smoke: { executor: "constant-vus", vus: 1, duration: "30s" },
  ramp: {
    executor: "ramping-vus",
    startVUs: 0,
    stages: [
      { duration: "2m", target: 25 },
      { duration: "3m", target: 50 },
      { duration: "3m", target: 100 },
      { duration: "3m", target: 200 },
      { duration: "1m", target: 0 },
    ],
    gracefulRampDown: "30s",
  },
  spike: {
    executor: "ramping-vus",
    startVUs: 0,
    stages: [
      { duration: "1m", target: 10 },
      { duration: "20s", target: 300 },
      { duration: "2m", target: 300 },
      { duration: "1m", target: 10 },
      { duration: "30s", target: 0 },
    ],
  },
  soak: { executor: "constant-vus", vus: 60, duration: "20m" },
};

export const options = {
  scenarios: { visitors: PROFILES[__ENV.PROFILE || "ramp"] },
  thresholds: {
    // stop early when the site is clearly failing, so the test does not become the outage
    http_req_failed: [{ threshold: "rate<0.05", abortOnFail: true, delayAbortEval: "1m" }, "rate<0.01"],
    "http_req_duration{part:static}": ["p(95)<500"],
    "http_req_duration{part:cms}": ["p(95)<1000"],
    visit_duration: ["p(95)<3000"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "max"],
};

/** The site's script, style and font files, read once from the page. */
export function setup() {
  const res = http.get(`${BASE}/`, PARAMS);
  if (res.status !== 200) throw new Error(`${BASE}/ answered ${res.status}; check BASE_URL`);
  // paths sit back to back in Next.js's inline data, so each match ends at its file extension
  const assets = [...new Set(res.body.match(/\/_next\/static\/[\w\-/.~]+?\.(?:js|css|woff2?|ttf|png|svg|webp)/g) || [])];
  return { assets };
}

function get(url, part, name) {
  return http.get(url, { ...PARAMS, tags: { part, name } });
}

export default function (data) {
  const start = Date.now();
  const firstVisit = Math.random() < NEW_SHARE;
  const pap = Math.random() < PAP_SHARE;

  group("page", () => {
    const page = get(`${BASE}/`, "static", "page");
    check(page, { "page 200": (r) => r.status === 200 });
    // a first visit downloads the hashed files; a repeat visitor has them cached (immutable)
    if (firstVisit && data.assets.length) {
      http.batch(data.assets.map((a) => ["GET", `${BASE}${a}`, null, { ...PARAMS, tags: { part: "static", name: "asset" } }]));
    }
  });

  group("data", () => {
    const responses = http.batch([
      ["GET", `${BASE}/config.json`, null, { ...PARAMS, tags: { part: "static", name: "config" } }],
      ["GET", `${BASE}/data/forecast.json`, null, { ...PARAMS, tags: { part: "static", name: "forecast" } }],
    ]);
    check(responses[1], { "forecast 200": (r) => r.status === 200 });
  });

  group("cms", () => {
    const reqs = CMS_REQUESTS.map(([name, url]) => ["GET", url, null, { ...CMS_PARAMS, tags: { part: "cms", name } }]);
    if (pap) reqs.push(["GET", TRANSLATIONS, null, { ...CMS_PARAMS, tags: { part: "cms", name: "translations" } }]);
    const responses = http.batch(reqs);
    for (const r of responses) cmsLimited.add(r.status === 429);
    check(responses, { "cms 200 (or rate-limited)": (rs) => rs.every((r) => r.status === 200 || r.status === 429) });
  });

  visitTime.add(Date.now() - start);
  // a person reads the page before doing anything else: 5 to 15 s
  sleep(5 + Math.random() * 10);
}
