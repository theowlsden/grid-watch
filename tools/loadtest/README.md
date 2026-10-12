# Load test

`visit.js` is a [k6](https://k6.io) script that sends simulated visitors to the live site and
measures how it holds up. It only makes the public, read-only requests a browser makes: never
sign-ins, never writes.

## What one simulated visitor does

1. Loads the page. About 30 % are first-time visitors who also download the scripts, styles and
   fonts (`NEW_SHARE`); repeat visitors have those cached.
2. Loads `config.json` and `forecast.json` from the web service.
3. Loads news, sites and the island from the CMS, and the translations for the 30 % who use
   Papiamentu (`PAP_SHARE`).
4. Reads the page for 5 to 15 seconds, then starts over.

That is about 12 requests per visit, 3 to 4 of them to the CMS. One simulated visitor stands for
one person with the page open. 200 of them make about 20 visits a second, or about 1,200 a
minute: roughly 230 requests a second, 65 of them to the CMS.

## Profiles

| `PROFILE` | What | Length |
|---|---|---|
| `smoke` | 1 visitor; checks that the script and the URLs work | 30 s |
| `ramp` (default) | 25 → 50 → 100 → 200 visitors in steps | 12 min |
| `spike` | 10 visitors, then 300 within 20 s and held for 2 min (a viral post) | 5 min |
| `soak` | 60 visitors steadily, to catch slow leaks | 20 min |

## Running it

Install k6 (`sudo apt install k6` after adding Grafana's repository, `brew install k6`, or use
Docker as below), then from the repository root:

```sh
k6 run -e PROFILE=smoke tools/loadtest/visit.js   # always first
k6 run tools/loadtest/visit.js                    # the ramp
# without installing k6:
docker run --rm -v "$PWD/tools/loadtest:/scripts:ro" -e PROFILE=smoke grafana/k6 run /scripts/visit.js
```

`BASE_URL` and `CMS_URL` default to the live site; point them elsewhere to test a copy.

**Before running against the live site**

- Pick a quiet time: real visitors share the same server.
- Run `smoke` first. If it fails, fix that before adding load.
- Run from somewhere other than a home connection if you can (a small cloud server, or k6
  Cloud's free tier). From home, the upload speed of your connection may be the first limit
  you hit.
- Ramp up, never start at full load: Hostinger's network protection can treat a sudden flood
  as an attack and block your IP for a while.
- The test stops by itself once more than 5 % of requests fail, so it does not turn into an
  outage.

## The CMS's own rate limit

The CMS allows each IP address 120 requests per 10 seconds (`cms/pb_migrations/1791500000_settings.js`).
A test run from one machine counts as one visitor, so from about 35 simulated visitors on, the
CMS answers part of the requests with **429 Too Many Requests**. That is the protection working,
not an overload. The script counts these as `cms_rate_limited` instead of failures.

To measure how much the CMS itself can take, raise the limit for the duration of the test (CMS
admin → Settings → Rate limits, the `/api/` rule for guests) and set it back afterwards. With
Cloudflare caching the CMS's public answers, most requests never reach the CMS and its limit;
real visitors each have their own IP (`cms/pb_hooks/client_ip.pb.js` reads it from Cloudflare).

## What to watch on the server

In a second terminal, over SSH to the VPS:

```sh
docker stats            # CPU and memory per container (web, cms, pipeline, bot, proxy)
htop                    # the whole machine
```

The visits are tagged `GridWatchLoadTest/1` in the User-Agent, so they can be told apart in
any access logs.

## Reading the results

k6 prints a summary at the end. The lines that matter:

- `http_req_failed`: share of failed requests. Under 1 % is fine.
- `http_req_duration{part:static}` and `{part:cms}`: response times for the web service and
  the CMS. Watch `p(95)`, the time 95 % of requests stay under. Targets: 500 ms for static
  files, 1 s for the CMS.
- `visit_duration`: the whole visit, all requests together. Target: under 3 s at p(95).
- `cms_rate_limited`: share of CMS requests answered 429 by the rate limit (see above).
- A ✗ next to a threshold means that target was missed.

The useful number is the step of the ramp where response times start to climb or errors appear,
together with what `docker stats` showed at that moment:

- **cms at about 100 % CPU** (PocketBase): the CMS is the limit. Every visitor reaches it, since
  nothing caches its answers in between.
- **the proxy or web at high CPU**: the static side or the proxy.
- **the whole machine at 200 % CPU** (two cores) with nothing standing out: the VPS itself.
- **high response times with low CPU everywhere**: bandwidth, either the VPS's or the
  connection the test runs from.

## On a Hostinger KVM 2 (2 vCPU, 8 GB)

A rough expectation, to be replaced by what the test shows: Caddy serves the static files with
room to spare, and memory is not the issue at this size. The CMS and the two CPU cores are the
likely limits. If the ramp holds 200 visitors with good times, that is about 1,200 visits a
minute, far beyond what a local community site usually sees, except right after a big outage
when many people look at once.

If it does not hold, the biggest improvement is a CDN in front of the site (Cloudflare's free
plan): it serves the static files and can cache the CMS's public answers (they already allow
60 s of caching), so most visits never reach the VPS.
