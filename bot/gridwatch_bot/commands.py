"""Bot commands (spec 7.3). Pure logic: Telegram and the CMS come in as objects, so it is
tested without either. Only allowlisted user ids are served; everyone else is ignored
silently. Drafts by default; publishing and deleting need /confirm. Plain text only."""

from __future__ import annotations

import datetime as dt
import json
import re
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from .cms import Cms, CmsError

HELP = """Grid Watch news bot. Everything starts as a draft.

/news <text>  new draft (first line = title, the rest = text)
/pap <text>   Papiamentu title and text for the draft
/notice, /important, /info   how prominent the draft is
/link <https://...>   add a link
/expire 3d | 12h | 2026-10-12   when it disappears
/pin, /unpin  keep it on top
/show         show the current draft
/publish      publish the draft (asks for /confirm)
/list         latest items
/delete <id>  delete an item (asks for /confirm)
/confirm, /cancel
/run          new stress outlook now (at most every 30 minutes)
/status       last pipeline run"""

TITLE_MAX = 140
BODY_MAX = 2000
CONFIRM_SECONDS = 600
RATE_LIMIT = (20, 600)  # commands per user per window (seconds)


def split_text(text: str) -> tuple[str, str]:
    """First line is the title, the rest the body; a single line is both."""
    lines = [ln.rstrip() for ln in text.strip().splitlines()]
    title = lines[0].strip() if lines else ""
    body = "\n".join(lines[1:]).strip() or title
    if len(title) > TITLE_MAX:
        title = title[: TITLE_MAX - 1].rstrip() + "…"
    return title, body[:BODY_MAX]


def parse_expiry(arg: str, now: dt.datetime) -> dt.datetime | None:
    """3d, 12h, 30m from now, or a date (end of that day in Curaçao, UTC-4)."""
    m = re.fullmatch(r"(\d{1,3})\s*([dhm])", arg.strip().lower())
    if m:
        n, unit = int(m.group(1)), m.group(2)
        return now + {"d": dt.timedelta(days=n), "h": dt.timedelta(hours=n), "m": dt.timedelta(minutes=n)}[unit]
    try:
        d = dt.date.fromisoformat(arg.strip())
    except ValueError:
        return None
    return dt.datetime(d.year, d.month, d.day, 23, 59, tzinfo=dt.timezone(dt.timedelta(hours=-4))).astimezone(dt.timezone.utc)


def pb_date(t: dt.datetime) -> str:
    return t.astimezone(dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%S.000Z")


def describe(item: dict) -> str:
    parts = [f"[{item.get('status')}] {item.get('severity', 'info')} · {item.get('id')}", item.get("title_en", "")]
    body = item.get("body_en", "")
    if body and body != item.get("title_en"):
        parts.append(body)
    if item.get("title_pap"):
        parts.append(f"PAP: {item['title_pap']}")
    if item.get("link"):
        parts.append(f"Link: {item['link']}")
    if item.get("expiresAt"):
        parts.append(f"Expires: {item['expiresAt'][:16]} UTC")
    if item.get("pinned"):
        parts.append("Pinned")
    return "\n".join(p for p in parts if p)


@dataclass
class Pending:
    action: str  # "publish" | "delete"
    record_id: str
    expires: float


@dataclass
class Bot:
    cms: Cms
    allowed: set[int]
    control_dir: Path | None = None
    clock: callable = time.time  # type: ignore[valid-type]
    pending: dict[int, Pending] = field(default_factory=dict)
    usage: dict[int, list[float]] = field(default_factory=dict)
    runs: dict[str, tuple[int, float]] = field(default_factory=dict)  # request id -> (chat, requested at)

    # ---------- entry point ----------

    def handle(self, update: dict) -> tuple[int, str] | None:
        """Returns (chat id, reply) or None. Non-allowlisted users get no reply at all."""
        msg = update.get("message") or {}
        user = (msg.get("from") or {}).get("id")
        chat = (msg.get("chat") or {}).get("id")
        text = msg.get("text") or ""
        if user not in self.allowed or chat is None:
            return None
        if not self._allow(user):
            return chat, "Too many commands; try again in a few minutes."
        cmd, _, arg = text.strip().partition(" ")
        cmd = cmd.split("@")[0].lower()
        try:
            return chat, self._dispatch(cmd, arg.strip(), user, chat)
        except CmsError as err:
            return chat, f"The CMS refused or is unreachable ({err.status}). Nothing was changed."

    def _allow(self, user: int) -> bool:
        limit, window = RATE_LIMIT
        now = self.clock()
        recent = [t for t in self.usage.get(user, []) if now - t < window]
        recent.append(now)
        self.usage[user] = recent
        return len(recent) <= limit

    # ---------- commands ----------

    def _dispatch(self, cmd: str, arg: str, user: int, chat: int) -> str:
        if cmd in ("/start", "/help"):
            return HELP
        if cmd == "/news":
            if not arg:
                return "Usage: /news <title>\n<optional text on the next lines>"
            title, body = split_text(arg)
            rec = self.cms.create({"title_en": title, "body_en": body, "status": "draft", "severity": "info"})
            return f"Draft saved (not public yet).\n\n{describe(rec)}\n\nAdd /pap, /notice, /expire … then /publish."
        if cmd == "/list":
            items = self.cms.list("", "-created", 5)
            return "\n\n".join(describe(i) for i in items) or "No items yet."
        if cmd == "/delete":
            if not re.fullmatch(r"[a-z0-9]{15}", arg):
                return "Usage: /delete <id> (the id from /list)"
            rec = self.cms.get(arg)
            self.pending[user] = Pending("delete", arg, self.clock() + CONFIRM_SECONDS)
            return f"Delete this item?\n\n{describe(rec)}\n\nReply /confirm within 10 minutes, or /cancel."
        if cmd == "/confirm":
            return self._confirm(user)
        if cmd == "/cancel":
            return "Cancelled." if self.pending.pop(user, None) else "Nothing to cancel."
        if cmd == "/run":
            return self._request_run(chat)
        if cmd == "/status":
            return self._status()

        draft = self.cms.latest_draft()
        if cmd in ("/pap", "/notice", "/important", "/info", "/link", "/expire", "/pin", "/unpin", "/show", "/publish") and not draft:
            return "No draft. Start one with /news <text>."
        if cmd == "/show":
            return describe(draft)
        if cmd == "/pap":
            if not arg:
                return "Usage: /pap <titulo>\n<teksto>"
            title, body = split_text(arg)
            return "Papiamentu added.\n\n" + describe(self.cms.update(draft["id"], {"title_pap": title, "body_pap": body}))
        if cmd in ("/notice", "/important", "/info"):
            return "Updated.\n\n" + describe(self.cms.update(draft["id"], {"severity": cmd[1:]}))
        if cmd in ("/pin", "/unpin"):
            return "Updated.\n\n" + describe(self.cms.update(draft["id"], {"pinned": cmd == "/pin"}))
        if cmd == "/link":
            if not re.fullmatch(r"https://\S+", arg):
                return "Links must start with https://"
            return "Link added.\n\n" + describe(self.cms.update(draft["id"], {"link": arg}))
        if cmd == "/expire":
            when = parse_expiry(arg, dt.datetime.fromtimestamp(self.clock(), dt.timezone.utc))
            if not when:
                return "Usage: /expire 3d | 12h | 30m | 2026-10-12"
            return "Expiry set.\n\n" + describe(self.cms.update(draft["id"], {"expiresAt": pb_date(when)}))
        if cmd == "/publish":
            self.pending[user] = Pending("publish", draft["id"], self.clock() + CONFIRM_SECONDS)
            return f"Publish this on the site?\n\n{describe(draft)}\n\nReply /confirm within 10 minutes, or /cancel."
        return "Unknown command. /help lists them."

    def _confirm(self, user: int) -> str:
        p = self.pending.pop(user, None)
        if not p or p.expires < self.clock():
            return "Nothing to confirm (or it expired). Start again."
        if p.action == "publish":
            rec = self.cms.update(p.record_id, {"status": "published"})
            return f"Published.\n\n{describe(rec)}"
        self.cms.delete(p.record_id)
        return "Deleted."

    # ---------- pipeline runs (decision 17) ----------

    def _request_run(self, chat: int) -> str:
        if not self.control_dir:
            return "Manual runs are not set up on this server."
        req = self.control_dir / "run-request.json"
        if req.exists() or (self.control_dir / "run-request.processing").exists():
            return "A run is already requested; I'll report when it finishes."
        rid = uuid.uuid4().hex[:12]
        tmp = self.control_dir / f".run-request.{rid}.tmp"
        tmp.write_text(json.dumps({"id": rid, "requested_at": dt.datetime.now(dt.timezone.utc).isoformat()}))
        tmp.replace(req)
        self.runs[rid] = (chat, self.clock())
        return "Run requested. The pipeline picks it up within a minute; I'll report back."

    def tick(self) -> list[tuple[int, str]]:
        """Reports finished manual runs (called from the polling loop)."""
        out = []
        if not self.control_dir:
            return out
        for rid, (chat, since) in list(self.runs.items()):
            res = self.control_dir / f"run-result.{rid}.json"
            if res.exists():
                try:
                    r = json.loads(res.read_text())
                except ValueError:
                    continue
                res.unlink(missing_ok=True)
                del self.runs[rid]
                out.append((chat, _run_message(r)))
            elif self.clock() - since > 900:
                del self.runs[rid]
                out.append((chat, "No result after 15 minutes; check the pipeline in Coolify."))
        return out

    def _status(self) -> str:
        if not self.control_dir:
            return "Status is not available on this server."
        path = self.control_dir / "last-run.json"
        if not path.exists():
            return "No run reported yet."
        return _run_message(json.loads(path.read_text()))


def _run_message(r: dict) -> str:
    if r.get("result") == "refused":
        return "Not run: the last manual run was less than 30 minutes ago."
    f = r.get("forecast") or {}
    head = "Run finished." if r.get("result") == "ok" else "Run failed; the site keeps its last good outlook."
    lines = [head, f"Status: {r.get('status')}", f"Issued: {f.get('issued_at', '-')}", f"Model run: {f.get('model_run', '-')}"]
    lines.append("Published on the site." if f.get("published") else "Preview only (publishing is off).")
    return "\n".join(lines)
