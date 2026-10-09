# Deployment (Coolify on the Hostinger VPS)

Spec 7.6. Three services from one compose file, `docker-compose.yaml` at the repository root
(build context: the repo root). It sits at the root because Coolify runs compose with the repo
root as project directory, and compose resolves build paths against that directory. The Telegram bot is added in its own step.

| Service | Image | Listens | Domain | Data |
|---|---|---|---|---|
| `web` | Caddy serving the static export, security headers | 8080 | `grid.noirvisuals.studio` | reads `gridwatch-data` (read-only) |
| `cms` | PocketBase 0.40.5 (pinned, checksum verified) | 8090 | `cms.grid.noirvisuals.studio` | `pb-data` |
| `pipeline` | Python 3.12 + supercronic, daily run | none | none | writes `gridwatch-data` |

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
   - pipeline: no domain.
4. **Environment variables** (Coolify → Environment; never in the repo, see `.env.example`):

   | Variable | Service | Value |
   |---|---|---|
   | `SITE_ORIGIN` | cms | `https://grid.noirvisuals.studio` (CORS: only the site may call the CMS) |
   | `CMS_ORIGIN` | web | `https://cms.grid.noirvisuals.studio` (added to the CSP `connect-src`) |
   | `PB_SUPERUSER_EMAIL`, `PB_SUPERUSER_PASSWORD` | cms | strong, unique; set **before the first deploy** |
   | `PB_ENCRYPTION_KEY` | cms | 32 random characters, e.g. `openssl rand -hex 16`; keep a copy in your password manager |
   | `PB_ADMIN_IPS` | cms | optional: your IPs/subnets, space-separated |
   | `PB_BOT_EMAIL`, `PB_BOT_PASSWORD` | cms | the Telegram bot's restricted account (news only); password at least 16 characters; set with the bot step |
   | `OPEN_METEO_API_KEY` | pipeline | only with a paid plan (Phase 2) |

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
