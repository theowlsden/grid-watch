"""PocketBase client for the bot's restricted account (spec 7.3): news, drafts of events and
notices made from reports (decision 29), the end time of a published event, report status."""

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

    # ---------- any collection the bot may use: news, events, notices, reports ----------

    def create(self, fields: dict, collection: str = "news") -> dict:
        return self._call("POST", f"/api/collections/{collection}/records", fields)  # type: ignore[return-value]

    def update(self, rid: str, fields: dict, collection: str = "news") -> dict:
        return self._call("PATCH", f"/api/collections/{collection}/records/{urllib.parse.quote(rid)}", fields)  # type: ignore[return-value]

    def delete(self, rid: str, collection: str = "news") -> None:
        self._call("DELETE", f"/api/collections/{collection}/records/{urllib.parse.quote(rid)}")

    def get(self, rid: str, collection: str = "news") -> dict:
        return self._call("GET", f"/api/collections/{collection}/records/{urllib.parse.quote(rid)}")  # type: ignore[return-value]

    def list(self, filter_: str = "", sort: str = "-created", per_page: int = 5, collection: str = "news") -> list[dict]:
        q = urllib.parse.urlencode({"filter": filter_, "sort": sort, "perPage": per_page})
        return self._call("GET", f"/api/collections/{collection}/records?{q}")["items"]  # type: ignore[index]

    # ---------- events (decision 25): the bot may only close an ongoing one ----------

    def ongoing_events(self, per_page: int = 10) -> list[dict]:
        """Published events without an end time, newest first."""
        q = urllib.parse.urlencode({"filter": 'status = "published" && end_local = ""', "sort": "-startsAt", "perPage": per_page})
        return self._call("GET", f"/api/collections/events/records?{q}")["items"]  # type: ignore[index]

    def set_event_end(self, rid: str, end_local: str) -> dict:
        return self._call("PATCH", f"/api/collections/events/records/{urllib.parse.quote(rid)}", {"end_local": end_local})  # type: ignore[return-value]

    def new_reports(self, after: str, per_page: int = 20) -> list[dict]:
        """Public reports (decision 26) with status "new", created after `after` (PocketBase date), oldest first."""
        q = urllib.parse.urlencode({"filter": f'status = "new" && created > "{after}"', "sort": "created", "perPage": per_page})
        return self._call("GET", f"/api/collections/reports/records?{q}")["items"]  # type: ignore[index]

    def open_reports(self, per_page: int = 10) -> list[dict]:
        """Reports still waiting for review (status "new"), newest first."""
        return self.list('status = "new"', "-created", per_page, "reports")

    def latest_draft(self) -> dict | None:
        """The newest draft the bot made, of any kind, with "_collection" set: news, events or notices."""
        found = []
        for coll, mine in (("news", 'source = "telegram"'), ("events", 'author ~ "bot:"'), ("notices", 'author ~ "bot:"')):
            for item in self.list(f'status = "draft" && {mine}', "-updated", 1, coll):
                found.append({**item, "_collection": coll})
        return max(found, key=lambda i: i.get("updated", ""), default=None)
