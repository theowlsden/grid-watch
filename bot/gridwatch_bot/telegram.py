"""Minimal Telegram Bot API client: long polling and plain-text replies (no formatting, no HTML)."""

from __future__ import annotations

import json
import urllib.error
import urllib.request


class TelegramError(RuntimeError):
    pass


class Telegram:
    def __init__(self, token: str, base: str = "https://api.telegram.org"):
        self._url = f"{base}/bot{token}"

    def _call(self, method: str, payload: dict, timeout: float) -> object:
        req = urllib.request.Request(
            f"{self._url}/{method}",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as res:
                data = json.loads(res.read())
        except urllib.error.HTTPError as err:
            # the token is in the URL: never include the URL in errors or logs
            raise TelegramError(f"{method}: HTTP {err.code}") from None
        except (urllib.error.URLError, TimeoutError, OSError) as err:
            raise TelegramError(f"{method}: {type(err).__name__}") from None
        if not data.get("ok"):
            raise TelegramError(f"{method}: {data.get('description', 'not ok')}")
        return data["result"]

    def me(self) -> dict:
        return self._call("getMe", {}, 15)  # type: ignore[return-value]

    def updates(self, offset: int | None, timeout: int = 50) -> list[dict]:
        payload: dict = {"timeout": timeout, "allowed_updates": ["message"]}
        if offset is not None:
            payload["offset"] = offset
        return self._call("getUpdates", payload, timeout + 10)  # type: ignore[return-value]

    def send(self, chat_id: int, text: str) -> None:
        # plain text only: no parse_mode, link previews off
        self._call("sendMessage", {"chat_id": chat_id, "text": text[:4000], "link_preview_options": {"is_disabled": True}}, 15)
