# bot

Telegram news bot (spec 7.3, Phase 1b). Python standard library only; long polling, so it needs
no public address. It writes to the CMS `news` collection with the restricted `bots` account,
which can only read and change news.

## Commands

| Command | What it does |
|---|---|
| `/news <text>` | new **draft** (first line = title, the rest = text) |
| `/pap <text>` | Papiamentu title and text for the draft |
| `/notice`, `/important`, `/info` | how prominent the draft is |
| `/link <https://...>` | add a link (https only) |
| `/expire 3d` / `12h` / `30m` / `2026-10-12` | when it disappears (a date means the end of that day, Curaçao time) |
| `/pin`, `/unpin` | keep it on top |
| `/show` | show the current draft |
| `/publish` | shows the draft and asks for `/confirm` (valid 10 minutes) |
| `/list` | the five latest items with their ids |
| `/delete <id>` | asks for `/confirm` |
| `/confirm`, `/cancel` | |
| `/run` | new stress outlook now; the pipeline picks it up within a minute and the bot reports back (at most one manual run per 30 minutes) |
| `/status` | the last manual run |

## Security (spec 7.3)

- Only the numeric user ids in `TELEGRAM_ALLOWED_USER_IDS` get any answer; everyone else is ignored silently. Revoke access by removing an id.
- Drafts by default; publishing and deleting need `/confirm`.
- At most 20 commands per user per 10 minutes.
- Plain text only: the bot sends no formatting, and the site renders news as text.
- The token and the bot account's password live only in environment variables; the token never appears in logs or errors.

## Setup

1. In Telegram, talk to **@BotFather**, `/newbot`, and copy the token.
2. Find your numeric user id, e.g. by messaging **@userinfobot**.
3. In Coolify, set on the `bot` service: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_IDS` (comma-separated),
   and `PB_BOT_EMAIL` / `PB_BOT_PASSWORD` (the same values as on the `cms` service, which creates the account).
4. Redeploy and send `/help` to your bot.

Without a token the bot idles and says so in its log; the container stays healthy.

```sh
pipeline/.venv/bin/python -m pytest -q bot/tests                              # unit tests
POCKETBASE_BIN=/path/to/pocketbase pipeline/.venv/bin/python -m pytest -q bot/tests  # plus a real CMS
```
