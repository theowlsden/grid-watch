"""PocketBase client for the bot's restricted account (news only, spec 7.3)."""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request


class CmsError(RuntimeError):
    def __init__(self, status: int, message: str):
        super().__init__(f"CMS {status}: {message}")
        self.status = status


class Cms:
    def __init__(self, base: str, email: str, password: str):
        self.base = base.rstrip("/")
        self.email = email
        self.password = password
        self._token: str | None = None

    def _request(self, method: str, path: str, body: dict | None = None, auth: bool = True) -> object:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method, headers={"Content-Type": "application/json"})
        if auth:
            req.add_header("Authorization", self.token())
        try:
            with urllib.request.urlopen(req, timeout=15) as res:
                raw = res.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as err:
            try:
                msg = json.loads(err.read()).get("message", "")
            except ValueError:
                msg = ""
            if err.code == 401 and auth:
                self._token = None  # expired: sign in again on the next call
            raise CmsError(err.code, msg) from None
        except (urllib.error.URLError, TimeoutError, OSError) as err:
            raise CmsError(0, f"unreachable ({type(err).__name__})") from None

    def token(self) -> str:
        if not self._token:
            res = self._request(
                "POST", "/api/collections/bots/auth-with-password", {"identity": self.email, "password": self.password}, auth=False
            )
            self._token = res["token"]  # type: ignore[index]
        return self._token

    def _call(self, method: str, path: str, body: dict | None = None) -> object:
        try:
            return self._request(method, path, body)
        except CmsError as err:
            if err.status == 401:  # token expired: retry once with a fresh one
                return self._request(method, path, body)
            raise

    def create(self, fields: dict) -> dict:
        return self._call("POST", "/api/collections/news/records", fields)  # type: ignore[return-value]

    def update(self, rid: str, fields: dict) -> dict:
        return self._call("PATCH", f"/api/collections/news/records/{urllib.parse.quote(rid)}", fields)  # type: ignore[return-value]

    def delete(self, rid: str) -> None:
        self._call("DELETE", f"/api/collections/news/records/{urllib.parse.quote(rid)}")

    def get(self, rid: str) -> dict:
        return self._call("GET", f"/api/collections/news/records/{urllib.parse.quote(rid)}")  # type: ignore[return-value]

    def list(self, filter_: str = "", sort: str = "-created", per_page: int = 5) -> list[dict]:
        q = urllib.parse.urlencode({"filter": filter_, "sort": sort, "perPage": per_page})
        return self._call("GET", f"/api/collections/news/records?{q}")["items"]  # type: ignore[index]

    def latest_draft(self) -> dict | None:
        items = self.list('status = "draft" && source = "telegram"', "-created", 1)
        return items[0] if items else None
