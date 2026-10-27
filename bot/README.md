# bot

Telegram bot for editors (spec 7.3). Python standard library only; long polling, so it needs
no public address. It works with the three kinds of item (decision 25): **news** from the
project, **events** (what happened) and **notices** (what the utility announced), and turns
public reports from the site into event or notice drafts (decision 29). It signs in with the
restricted `bots` account (see Security).

## Commands

Everything starts as a draft; publishing and deleting ask for `/confirm` (valid 10 minutes).
The bot remembers the draft you last made or edited; `/show` shows it.

| Command | What it does |
|---|---|
| **News** | |
| `/news <text>` | new news **draft** (first line = title, the rest = text) |
| `/level info` / `notice` / `important` | how prominent it is (was `/info`, `/notice`, `/important`) |
| `/link <https://...>` | add a link (https only) |
| `/expire 3d` / `12h` / `30m` / `2026-10-12` | when it disappears (a date means the end of that day, Curaçao time) |
| `/pin`, `/unpin` | keep it on top |
| `/list` | the five latest news items with their ids |
| `/delete <id>` | delete news (asks for `/confirm`) |
| **Reports from the site** | |
| `/reports` | reports waiting for review, newest first, numbered |
| `/event 2` | event draft from report 2: type, scope, areas and times from the report, cause unknown, a plain summary made from those fields (never the reporter's note), the report's link if it has one. The report is marked *used* and linked to the draft |
| `/notice 2` | notice draft from report 2: announced load shedding / possible shortage / other, the publisher guessed from the link (Aqualectra for aqualectra.com) |
| `/reject 2`, `/spam 2` | set a report aside |
| **Events and notices** | |
| `/event <text>`, `/notice <text>` | a new draft without a report; the text is the summary, it starts now |
| `/set <field> <value>` | fill in the draft; `/set` alone lists the fields and their values. Events: `type`, `severity`, `cause`, `start`, `end`, `areas`, `summary`, `source`, `publisher`, `title`, `published`. Notices: `announced`, `publisher`, `published`, `start`, `end`, `expires`, `areas`, `summary`, `source`, `title`. Times as `2026-10-13 14:00`, or `14:00` for today; `none` clears. Areas: `island`, `unknown` or `Punda, Otrobanda` |
| `/discard` | delete the event or notice draft; a report it came from goes back to `/reports` |
| **Any draft** | |
| `/pap <text>` | Papiamentu (title and text for news, the summary for events and notices) |
| `/show` | the current draft, with what is still missing before publishing |
| `/publish` | an event needs its source link, publisher, title and date; a notice its link and publisher. Then asks for `/confirm`. A published event is marked verified |
| `/confirm`, `/cancel` | |
| **Other** | |
| `/run` | new stress outlook now; the pipeline picks it up within a minute and the bot reports back (at most one manual run per 30 minutes) |
| `/status` | the last manual run |
| `/ongoing` | published events that are still ongoing (no end time yet), numbered |
| `/restored` | power is back: end the ongoing event now; `/restored 18:30` at a time today, `/restored 2 18:30` for event 2 of `/ongoing`. Asks for `/confirm` |

New reports are announced to every allowed user, at most once a minute.

## Security (spec 7.3)

- Only the numeric user ids in `TELEGRAM_ALLOWED_USER_IDS` get any answer; everyone else is ignored silently. Revoke access by removing an id.
- Drafts by default; publishing and deleting need `/confirm`.
- What the `bots` account may do (enforced by the CMS, `cms/pb_migrations/1792500000_bot_events_notices.js` and the hooks): write news; create event and notice **drafts** (whatever status it sends), read, edit, publish and delete only the drafts it made; on a published event set only the end time; on a report change only its status and its link to the draft. It cannot see or change editors' drafts, and the CMS checks sources on publishing as for everyone.
- A reporter's note is shown to editors but never copied into a draft.
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
