# cms

PocketBase 0.40.5 (pinned, see `deploy/cms/Dockerfile`) for news, sites and the island
(spec 7.3, 7.4). PocketBase is pre-1.0: upgrade only on purpose, after reading the release notes.

| Path | What |
|---|---|
| `pb_migrations/` | Settings (rate limits, no IPs in logs, trusted proxy) and the `news`, `sites`, `island` and `bots` collections; the sites and island are seeded once from `data/sites.snapshot.json` |
| `pb_hooks/` | Rules the schema cannot express: permanent slugs, https-only links, publish time, author and source fields, 60 s cache on public reads, bot account from the environment |
| `tests/` | Rules and hooks against a real PocketBase (`POCKETBASE_BIN=... pytest cms/tests`) |

## Access rules

| Collection | Public read | Write |
|---|---|---|
| `news` | only `status = published`, `publishedAt <= now`, not expired | superusers and the `bots` account |
| `sites` | only `enabled = true` | superusers |
| `island` | only `active = true` | superusers |
| `bots` | none | superusers (the bot account is created from `PB_BOT_EMAIL` / `PB_BOT_PASSWORD`) |

No public sign-up anywhere. Hooks run in isolated contexts: shared code lives in
`pb_hooks/lib/` and is loaded with `require()` inside each handler.

## Editing

- **News**: in the admin UI (`https://cms.grid.noirvisuals.studio/_/`) or later via the Telegram
  bot. Plain text only; links must be `https://`. Drafts are never public; set `expiresAt` for
  time-limited notes. News never changes the stress outlook.
- **Sites**: change names, parks, descriptions or positions here, then refresh the committed
  fallback: `python pipeline/tools/export_sites.py --cms https://cms.grid.noirvisuals.studio`
  and commit `data/sites.snapshot.json`. A slug cannot change; retire a site with
  `enabled = false` and add a new one.

## Local run

```sh
pocketbase migrate up   --dir=pb_data --migrationsDir=cms/pb_migrations --hooksDir=cms/pb_hooks
pocketbase superuser upsert you@example.org 'a-long-password' --dir=pb_data
PB_SEED_FILE=data/sites.snapshot.json pocketbase serve --dir=pb_data \
  --migrationsDir=cms/pb_migrations --hooksDir=cms/pb_hooks --origins=http://localhost:3000
```

For the web app to use it in development, set `"cmsOrigin": "http://127.0.0.1:8090"` in
`web/public/config.json` (do not commit that change).
