# Deployment (Coolify on the Hostinger VPS)

Spec 7.6. Four services from one compose file, `docker-compose.yaml` at the repository root
(build context: the repo root). It sits at the root because Coolify runs compose with the repo
root as project directory, and compose resolves build paths against that directory. The Telegram bot is added in its own step.

| Service | Image | Listens | Domain | Data |
|---|---|---|---|---|
| `web` | Caddy serving the static export, security headers | 8080 | `grid.noirvisuals.studio` | reads `gridwatch-data` (read-only) |
| `cms` | PocketBase 0.40.5 (pinned, checksum verified) | 8090 | `cms.grid.noirvisuals.studio` | `pb-data` |
| `pipeline` | Python 3.12 + supercronic, two runs a day | none | none | writes `gridwatch-data`, reads run requests from `gridwatch-control` |
| `bot` | Telegram news bot, Python standard library | none | none (long polling) | writes run requests to `gridwatch-control` |

All containers run as unprivileged users with every Linux capability dropped and
`no-new-privileges`; `web` and `pipeline` have read-only root filesystems. Base images are
pinned by digest. Nothing is published on host ports: only Coolify's proxy reaches `web` and `cms`.

## One-time setup

1. **DNS**: `A` records for `grid.noirvisuals.studio` and `cms.grid.noirvisuals.studio` pointing
   to the VPS IP. Coolify issues the TLS certificates.
2. **Coolify**: New resource → *Docker Compose* from this Git repository, branch `main`,
   base directory `/`, compose file `/docker-compose.yaml`. Turn on automatic deploys
   on push.
3. **Domains** (per service in Coolify, `domain:port` means the container port):
   - web: `https://grid.noirvisuals.studio:8080`
   - cms: `https://cms.grid.noirvisuals.studio:8090`
   - pipeline and bot: no domain.
4. **Environment variables** (Coolify → Environment; never in the repo, see `.env.example`):

   | Variable | Service | Value |
   |---|---|---|
   | `SITE_ORIGIN` | cms | `https://grid.noirvisuals.studio` (CORS: only the site may call the CMS) |
   | `CMS_ORIGIN` | web | `https://cms.grid.noirvisuals.studio` (added to the CSP `connect-src`) |
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
  An external uptime monitor can watch `https://grid.noirvisuals.studio/data/heartbeat.json`.

## Live outlook: preview first, then publish

The pipeline runs at 06:00 and 16:00 Curaçao time (and once on start if its last forecast is
older than 6 hours). With `GRIDWATCH_PUBLISH=0` it writes `/data/preview/forecast.json`; open
`https://grid.noirvisuals.studio/?preview=1` to see it on the site, tagged "Preview, not
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
| `SITE_ORIGIN is empty` / `must start with https://` / `without a path` | set `SITE_ORIGIN=https://grid.noirvisuals.studio` on the cms service |
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
