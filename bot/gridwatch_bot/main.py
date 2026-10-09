"""Runs the bot: long polling, no public route (spec 7.3).

Environment:
  TELEGRAM_BOT_TOKEN          from @BotFather (secret)
  TELEGRAM_ALLOWED_USER_IDS   comma-separated numeric Telegram user ids; everyone else is ignored
  PB_BOT_EMAIL / PB_BOT_PASSWORD   the CMS's restricted bot account (news only)
  CMS_INTERNAL_URL            the CMS inside the Docker network (default http://cms:8090)
  GRIDWATCH_CONTROL_DIR       shared with the pipeline, for /run (default /var/lib/gridwatch-control)

Not configured (no token): the bot idles and says so, without crash-looping. A wrong token or
CMS login is reported clearly and retried slowly.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

from .cms import Cms, CmsError
from .commands import Bot
from .telegram import Telegram, TelegramError

HEARTBEAT = Path("/tmp/bot-heartbeat")


def log(msg: str) -> None:
    print(f"[grid-watch bot] {msg}", flush=True)


def beat() -> None:
    HEARTBEAT.write_text(str(time.time()))


def idle(reason: str) -> None:
    log(f"BOT NOT RUNNING: {reason}")
    while True:
        beat()  # healthy: an unconfigured bot is a choice, not a failure
        time.sleep(60)


def allowed_ids(raw: str) -> set[int]:
    ids = set()
    for part in raw.replace(" ", "").split(","):
        if part:
            if not part.isdigit():
                raise ValueError(f"not a numeric Telegram user id: {part!r}")
            ids.add(int(part))
    return ids


def main() -> int:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        idle("TELEGRAM_BOT_TOKEN is not set. Create a bot with @BotFather and set it in Coolify to enable news by Telegram.")
    try:
        allowed = allowed_ids(os.environ.get("TELEGRAM_ALLOWED_USER_IDS", ""))
    except ValueError as err:
        idle(f"TELEGRAM_ALLOWED_USER_IDS: {err}")
    if not allowed:
        idle("TELEGRAM_ALLOWED_USER_IDS is empty; nobody would be allowed to use the bot.")
    email, password = os.environ.get("PB_BOT_EMAIL", ""), os.environ.get("PB_BOT_PASSWORD", "")
    if not email or not password:
        idle("PB_BOT_EMAIL / PB_BOT_PASSWORD are not set (the same values as on the cms service).")

    tg = Telegram(token)
    cms = Cms(os.environ.get("CMS_INTERNAL_URL", "http://cms:8090"), email, password)
    control = Path(os.environ.get("GRIDWATCH_CONTROL_DIR", "/var/lib/gridwatch-control"))
    bot = Bot(cms, allowed, control if control.is_dir() else None)

    for attempt in range(1, 10_000):
        try:
            me = tg.me()
            cms.token()
            log(f"running as @{me.get('username')} for {len(allowed)} allowed user(s)")
            break
        except TelegramError as err:
            log(f"cannot reach Telegram or the token is wrong ({err}); retrying in a minute")
        except CmsError as err:
            log(f"cannot sign in to the CMS as the bot account ({err}); check PB_BOT_EMAIL / PB_BOT_PASSWORD; retrying in a minute")
        time.sleep(60)

    offset = None
    while True:
        beat()
        try:
            updates = tg.updates(offset, timeout=50)
        except TelegramError as err:
            log(f"polling failed ({err}); retrying")
            time.sleep(10)
            continue
        for u in updates:
            offset = u["update_id"] + 1
            reply = bot.handle(u)
            if reply:
                try:
                    tg.send(*reply)
                except TelegramError as err:
                    log(f"reply failed ({err})")
        for chat, text in bot.tick():
            try:
                tg.send(chat, text)
            except TelegramError as err:
                log(f"report failed ({err})")


if __name__ == "__main__":
    sys.exit(main())
