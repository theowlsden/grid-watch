# Deployment (Coolify on the Hostinger VPS)

> **This deployment**: the site runs at `grid.noirvisuals.studio` and the CMS at
> `cms.grid.noirvisuals.studio`. The instructions below use `grid.example.org` and
> `cms.grid.example.org` as placeholders; replace them with your own addresses.

Spec 7.6. Four services from one compose file, `docker-compose.yaml` at the repository root
(build context: the repo root). It sits at the root because Coolify runs compose with the repo
root as project directory, and compose resolves build paths against that directory. The Telegram bot is added in its own step.

| Service | Image | Listens | Domain | Data |
|---|---|---|---|---|
| `web` | Caddy serving the static export, security headers | 8080 | `grid.example.org` | reads `gridwatch-data` (read-only) |
| `cms` | PocketBase 0.40.5 (pinned, checksum verified) | 8090 | `cms.grid.example.org` | `pb-data` |
| `pipeline` | Python 3.12 + supercronic, two runs a day | none | none | writes `gridwatch-data`, reads run requests from `gridwatch-control` |
| `bot` | Telegram news bot, Python standard library | none | none (long polling) | writes run requests to `gridwatch-control` |

All containers run as unprivileged users with every Linux capability dropped and
`no-new-privileges`; `web` and `pipeline` have read-only root filesystems. Base images are
pinned by digest. Nothing is published on host ports: only Coolify's proxy reaches `web` and `cms`.

## One-time setup

1. **DNS**: `A` records for `grid.example.org` and `cms.grid.example.org` pointing
   to the VPS IP. Coolify issues the TLS certificates.
2. **Coolify**: New resource → *Docker Compose* from this Git repository, branch `release`
   (not `main`: only tagged releases go live, see [Releases](#releases)), base directory `/`,
   compose file `/docker-compose.yaml`. Turn on automatic deploys on push, and
   **Include Source Commit in Build** so the methodology page shows the commit.
3. **Domains** (per service in Coolify, `domain:port` means the container port):
   - web: `https://grid.example.org:8080`
   - cms: `https://cms.grid.example.org:8090`
   - pipeline and bot: no domain.
4. **Environment variables** (Coolify → Environment; never in the repo, see `.env.example`):

   | Variable | Service | Value |
   |---|---|---|
   | `SITE_ORIGIN` | cms | `https://grid.example.org` (CORS: only the site may call the CMS) |
   | `CMS_ORIGIN` | web | `https://cms.grid.example.org` (added to the CSP `connect-src`) |
   | `TURNSTILE_SITEKEY` | web | Cloudflare Turnstile site key (public); opens the report form at `/report`. Empty keeps it closed |
   | `TURNSTILE_SECRET` | cms | the matching Turnstile **secret** (keep it secret; tick nothing else); checks every public report. Empty: reporting stays closed |
   | `ANALYTICS_TOKEN` | web | the token from Cloudflare Web Analytics' JS snippet (public), or empty for no analytics; restart web to apply |
   | `RESULTS_ENABLED` | web | empty (off) until the backtest has sourced events to score, then `true`: publishes `/results` and links it from the methodology page; restart web to apply |
   | `EVENTS_ENABLED` | web | empty (off) until the events in `data/events/events.yaml` have reliable public sources, then `true`; restart web to apply |
   | `PB_SUPERUSER_EMAIL`, `PB_SUPERUSER_PASSWORD` | cms | strong, unique; set **before the first deploy** |
   | `PB_ENCRYPTION_KEY` | cms | 32 random characters, e.g. `openssl rand -hex 16`; keep a copy in your password manager |
   | `PB_ADMIN_IPS` | cms | optional: your IPs/subnets, space-separated |
   | `PB_BOT_EMAIL`, `PB_BOT_PASSWORD` | cms | the Telegram bot's restricted account (news only); password at least 16 characters; set with the bot step |
   | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_IDS` | bot | token from @BotFather; your numeric Telegram user id(s), comma-separated; see `bot/README.md` |
   | `PB_BOT_EMAIL`, `PB_BOT_PASSWORD` | cms **and** bot | the same values on both |
   | `GRIDWATCH_PUBLISH` | pipeline | `0` (default): the live outlook is written as a preview only; `1`: it replaces the example data on the site |
   | `OPEN_METEO_API_KEY` | pipeline | only with a paid plan |

   In Coolify, untick **"Build variable"** for every secret (passwords, keys, tokens). The
   images do not need them at build time; they are read only when the containers start.

   Why the superuser variables matter: until a superuser exists, PocketBase prints a one-time
   setup link in its log. Creating the account from the environment closes that window. After
   the first successful start you may remove `PB_SUPERUSER_PASSWORD`; the account stays.
5. Deploy. All three services must turn **healthy** in Coolify.

## Releases

Only a tagged release goes live (decision 28). Work lands on `main` as before, with CI on
every push; the site keeps running the last release until the next tag.

1. Write what changed for visitors under **Unreleased** in [CHANGELOG.md](../CHANGELOG.md),
   commit and push to `main`.
2. `python3 tools/release.py 0.2.0` on an up-to-date, clean `main`. It sets the version in
   `web/package.json`, moves the notes under `0.2.0` with today's date, commits
   `chore(release): v0.2.0` and makes the tag. Check `git show v0.2.0`, then
   `git push --atomic origin main v0.2.0` (or pass `--push`).
3. The **Release** workflow checks that the tag is on `main`, matches `web/package.json` and has
   notes, runs the web and data tests on it, then moves the branch `release` to the tag and
   makes a GitHub release with the notes. Coolify sees the push to `release` and deploys.
4. The methodology page shows "Version 0.2.0 (abc1234)" once it is live.

Versions follow semantic versioning while the project is below 1.0: the middle number for
new features, the last for fixes only. **Roll back** by running the Release workflow by hand
(Actions → Release → Run workflow) with an earlier tag: it moves `release` back without
retesting. Never push to `release` yourself. A CMS migration is not undone by a rollback;
check the release notes before rolling back past one.

**Switching an existing install**: let the first Release run create the branch `release`, then
in Coolify change the resource's branch from `main` to `release` and tick *Include Source Commit
in Build*. From then on a push to `main` no longer deploys.

## CMS content

The site reads its CMS address at runtime from `/config.json`, which Caddy fills from
`CMS_ORIGIN`. News and sites are fetched in the browser with a 4 s timeout; if the CMS is down
the page shows no news (or the last copy it saw) and uses the sites built into the image. On its
first start the CMS seeds the sites and island from `data/sites.snapshot.json`. See `cms/README.md`.

## Health checks and observability

- `web`: `GET /healthz` → `ok`.
- `cms`: `GET /api/health`.
- `pipeline`: healthy while the last daily run succeeded less than 36 hours ago. Each run writes
  `/data/heartbeat.json` (time, status, version, inputs hash) and logs one summary line.
  An external uptime monitor can watch `https://grid.example.org/data/heartbeat.json`.

## Live outlook: preview first, then publish

The pipeline runs at 06:00 and 16:00 Curaçao time (and once on start if its last forecast is
older than 6 hours). With `GRIDWATCH_PUBLISH=0` it writes `/data/preview/forecast.json`; open
`https://grid.example.org/?preview=1` to see it on the site, tagged "Preview, not
published". When you are happy, set `GRIDWATCH_PUBLISH=1` and restart the pipeline: the next run
replaces the example data. Every run is archived under `/data/history/`, published or not.

## How data reaches the site

The pipeline writes to the `gridwatch-data` volume under `data/`. The web server answers
`/data/*` from that volume first and falls back to the copy built into the image (the example
forecast and the published events). A new forecast therefore never needs a rebuild. Events are
built from `data/events/events.yaml` during the image build; only events with filled-in sources
are published (decision 12.15).

## Security headers (web)

Set by `deploy/web/Caddyfile`: a strict Content-Security-Policy generated at build time
(`web/scripts/csp.mjs`: own origin only, inline scripts allowed by hash, no inline styles,
`connect-src` limited to the CMS origin), `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`, `X-Frame-Options`, `Cross-Origin-Opener-Policy`,
`Cross-Origin-Resource-Policy`, HSTS. Hashed assets are cached for a year, `/data/*` for 60 s,
HTML is revalidated. No access log is written (it would hold visitors' IP addresses).

## Troubleshooting: which container is running?

**In Coolify**: open the resource. Each service (`web`, `cms`, `pipeline`) has its own status
(running / healthy / unhealthy / restarting). The **Logs** tab has a selector for each container,
and **Terminal** opens a shell inside one. What the states mean here:

| Status | Meaning | Where to look |
|---|---|---|
| healthy | running and answering its health check | nothing to do |
| unhealthy (cms) | a required setting is wrong; the CMS waits instead of crash-looping | cms log: a line starting `[grid-watch cms] CMS NOT STARTED:` says which variable to fix |
| unhealthy (pipeline) | the last run failed or is older than 36 hours | pipeline log: `run_daily status=error` and the `ERROR` lines after it; also `/data/heartbeat.json` |
| restarting | the process keeps exiting | the log of that container; please report it, the images should not crash-loop |
| starting | first health checks still running (up to a minute) | wait |

The proxy only routes a domain to a **healthy** container, so "configured correctly but
unreachable" usually means the container behind that domain is not healthy yet.

**On the VPS (SSH)**: Coolify names containers `<service>-<resource uuid>`; the uuid is in the
resource URL and in the deploy log (e.g. `pgeywqmwhli2zqparhgseekk`).

```sh
docker ps -a --format 'table {{.Names}}\t{{.Status}}' | grep <resource-uuid>   # every service and its state
docker logs --tail 80 cms-<resource-uuid>                                    # last lines of one service
docker inspect --format '{{json .State.Health}}' cms-<resource-uuid>          # the health check results
```

**CMS messages** (`deploy/cms/entrypoint.sh`):

| Message | Fix |
|---|---|
| `SITE_ORIGIN is empty` / `must start with https://` / `without a path` | set `SITE_ORIGIN=https://grid.example.org` on the cms service |
| `PB_ENCRYPTION_KEY must be exactly 32 characters` | generate with `openssl rand -hex 16`; changing it later makes stored settings unreadable, keep a copy |
| `warning: superuser not changed: ...` | check `PB_SUPERUSER_EMAIL` (a valid address) and `PB_SUPERUSER_PASSWORD` (10+ characters); the CMS still starts |
| `warning: PB_ADMIN_IPS not applied` | use space-separated IPs or CIDR subnets, e.g. `203.0.113.7 198.51.100.0/24`; leave it empty to allow any IP (the password still protects sign-in) |

## Backups (spec 7.3, 7.6)

- **PocketBase**: in the admin UI → Settings → Backups, enable scheduled backups (e.g. daily,
  keep 14) to S3-compatible storage **off the VPS**. The S3 credentials are stored encrypted with
  `PB_ENCRYPTION_KEY`. Coolify's own database backups do not cover this volume.
- **Forecast archive** (`gridwatch-data`): only a heartbeat today. Before Phase 4 (immutable
  forecast history) add an off-VPS copy of the volume, e.g. a nightly `restic` or `rclone` job on
  the host. Archive files are never edited in place.
- **Restore test, once before launch**: create a news item, take a backup, restore it into a
  fresh `cms` container (Settings → Backups → restore, or copy the backup zip into `pb_data/backups`),
  and check the item is back.

## Before launch

- [ ] DNS records and certificates in place
- [ ] Environment variables set, superuser created, `PB_ENCRYPTION_KEY` stored safely
- [ ] All three services healthy
- [ ] PocketBase backups to off-VPS storage enabled, restore tested once
- [ ] Response headers checked (e.g. securityheaders.com) and the site works with them
- [ ] VPS has headroom next to the other Coolify apps

## Cloudflare (CDN, analytics, backups)

The whole domain (`example.org` here) moves to Cloudflare (free plan: whole domain only), so every
DNS record must exist there before the nameservers change at the registrar.

**DNS and proxy**

| Records | Proxy | Why |
|---|---|---|
| `grid`, `cms.grid` | Proxied (orange) | This project: cached, filtered, analytics |
| Email (Resend CNAMEs, MX, SPF/DKIM/DMARC TXT) | DNS only | Mail cannot go through the proxy |
| `coolify` | DNS only | Admin panel with live connections; no CDN in front of it |
| File services and other projects | DNS only | Free plan rejects uploads over 100 MB; decide per project |

The server's IP stays visible through the DNS-only records; that is accepted. The CMS trusts
Cloudflare's `CF-Connecting-IP` only on requests that come from Cloudflare's address ranges
(`cms/pb_hooks/client_ip.pb.js`), so rate limits count real visitors and the header cannot be
faked by going to the IP directly. Recheck the ranges in `cms/pb_hooks/lib/client_ip.js` when
upgrading PocketBase.

**Settings**

- SSL/TLS: **Full (strict)** (Coolify has valid certificates).
- Leave **Rocket Loader** and **Email Address Obfuscation** off: they insert scripts the
  Content Security Policy blocks. Same for Web Analytics' automatic script, until the CSP allows it.
- Optional cache rule for `cms.grid.example.org`, path `/api/collections/*/records`:
  eligible for cache, edge TTL "use cache-control header if present, bypass cache if not". Public
  answers allow 60 s; signed-in answers are `private, no-store` and never cached.

**Analytics**: Analytics → Traffic works with the proxy and needs no code. Web Analytics runs
from the site's own snippet (`ANALYTICS_TOKEN`, entry for the site's hostname, "JS snippet
installation"). Keep **automatic setup off for the domain's own entry**: it injects a second
beacon into every proxied page (only for browser-like requests, so a plain `curl` does not show it),
which starts first and takes the visits, leaving the snippet's entry at zero.

**Backups to R2**

1. Create a bucket (e.g. `gridwatch-backups`) and an R2 API token with read and write access to
   that bucket only.
2. CMS: admin → Settings → Backups → S3: endpoint `https://<account-id>.r2.cloudflarestorage.com`,
   region `auto`, the bucket and token keys, force path style on. Schedule e.g. `0 3 * * *`,
   keep 7. The keys are stored in PocketBase, encrypted with `PB_ENCRYPTION_KEY`.
3. Test a restore once (see Backups above).

The pipeline's archive of issued outlooks (`gridwatch-data` volume) is not covered by the CMS
backup; see Backups above.

**Report form (Turnstile)**: in Cloudflare → Turnstile → Add widget: name "Grid Watch reports",
hostname `grid.example.org`, mode Managed. Put the site key in `TURNSTILE_SITEKEY` (web) and the
secret in `TURNSTILE_SECRET` (cms), redeploy both. Reports land in the CMS collection
**reports** (status "new"); the Telegram bot announces them. Turn a sourced one into an event or
notice and set the report to "used"; mark junk "spam" or "rejected". Unsourced community reports
are only ever shown as grouped counts (two or more per day) under the events.

## Load testing

How much traffic the VPS handles: see [tools/loadtest/README.md](../tools/loadtest/README.md) (k6, read-only requests, run at a quiet time).
