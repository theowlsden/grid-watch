"""Bot commands (spec 7.3). Pure logic: Telegram and the CMS come in as objects, so it is
tested without either. Only allowlisted user ids are served; everyone else is ignored
silently. Drafts by default; publishing and deleting need /confirm. Plain text only.

Three kinds of item (decision 25): news from the project, events (what happened) and notices
(what the utility announced). Public reports from the site become event or notice drafts here
(decision 29); the bot never copies a reporter's own words into a draft."""

from __future__ import annotations

import datetime as dt
import json
import re
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

from .cms import Cms, CmsError

HELP = """Grid Watch bot. Everything starts as a draft; /publish asks for /confirm.

News (a message from the project)
/news <text>  new draft (first line = title, the rest = text)
/level info | notice | important   how prominent it is
/link <https://...>, /expire 3d | 12h | 2026-10-12, /pin, /unpin
/list         latest news;  /delete <id>  delete news (asks for /confirm)

Reports from the site
/reports      new reports, numbered
/event 2      turn report 2 into an event draft (what happened)
/notice 2     turn report 2 into a notice draft (what the utility announced)
/reject 2, /spam 2   set a report aside

Events and notices
/event <text>, /notice <text>   a new draft without a report (the text is the summary)
/set <field> <value>   fill in the draft; /set alone lists the fields
/discard      delete the event or notice draft (asks for /confirm)

Any draft
/pap <text>   Papiamentu
/show, /publish, /confirm, /cancel

/ongoing      events that are still ongoing
/restored     power is back: end the ongoing event now (asks for /confirm)
/restored 2 18:30   end event 2 from /ongoing at 18:30 today (Curaçao time)
/run          new stress outlook now (at most every 30 minutes);  /status  last run"""

TITLE_MAX = 140
BODY_MAX = 2000
SUMMARY_MAX = 1000
CONFIRM_SECONDS = 600
RATE_LIMIT = (20, 600)  # commands per user per window (seconds)
CURACAO = dt.timezone(dt.timedelta(hours=-4))

EVENT_TYPES = ("blackout", "outage", "load_shedding", "shortage")
ANNOUNCED = ("load_shedding", "possible_shortage", "maintenance", "other")
UNKNOWN_PUBLISHER = "unknown"
# /set <name> -> (field, allowed values or None); "areas" is handled on its own
EVENT_FIELDS = {
    "type": ("type", EVENT_TYPES),
    "severity": ("severity", ("minor", "major")),
    "cause": ("cause", ("supply", "network", "unknown")),
    "start": ("start_local", None),
    "end": ("end_local", None),
    "summary": ("summary_en", None),
    "publisher": ("source_publisher", None),
    "title": ("source_title", None),
    "source": ("source_url", None),
    "published": ("source_published", None),
}
NOTICE_FIELDS = {
    "announced": ("announced", ANNOUNCED),
    "publisher": ("publisher", None),
    "published": ("published_local", None),
    "start": ("starts_local", None),
    "end": ("ends_local", None),
    "expires": ("expires_local", None),
    "summary": ("summary_en", None),
    "title": ("source_title", None),
    "source": ("source_url", None),
}
TIME_FIELDS = {"start_local", "end_local", "published_local", "starts_local", "ends_local", "expires_local", "source_published"}


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


def parse_restored(arg: str, now: dt.datetime) -> tuple[int | None, str] | None:
    """'' | '2' | '18:30' | '2 18:30' -> (event number or None, local end time 'YYYY-MM-DD HH:MM')."""
    num, at = None, now.astimezone(CURACAO)
    for part in arg.split():
        if re.fullmatch(r"\d{1,2}", part):
            num = int(part)
        elif m := re.fullmatch(r"([01]?\d|2[0-3]):([0-5]\d)", part):
            at = at.replace(hour=int(m.group(1)), minute=int(m.group(2)), second=0, microsecond=0)
        else:
            return None
    return num, at.strftime("%Y-%m-%d %H:%M")


def local_time(value: str, now: dt.datetime) -> str:
    """'18:30' means today in Curaçao; anything else goes to the CMS as typed, which accepts
    2026-10-13 or 2026-10-13 14:00. 'none' or '-' clears the field."""
    v = value.strip()
    if v.lower() in ("none", "-"):
        return ""
    if m := re.fullmatch(r"([01]?\d|2[0-3]):([0-5]\d)", v):
        return now.astimezone(CURACAO).strftime("%Y-%m-%d ") + f"{int(m.group(1)):02d}:{m.group(2)}"
    return v


def where(rec: dict) -> str:
    if rec.get("scope") == "island":
        return "island-wide"
    return ", ".join(rec.get("areas") or []) or "area not known"


def describe_event(e: dict, n: int | None = None) -> str:
    head = f"{n}. " if n is not None else ""
    where_ = "area not reported" if e.get("scope") != "island" and not e.get("areas") else where(e)
    return f"{head}{e.get('type', '').replace('_', ' ')} since {e.get('start_local', '')[:16].replace('T', ' ')} ({where_})\n{e.get('summary_en', '')}"


def describe_report(r: dict, n: int | None = None) -> str:
    kind = "with a source" if r.get("kind") == "sourced" else "community, no source"
    when = r.get("date", "")
    if r.get("start_time"):
        when += f" from {r['start_time']}"
    if r.get("end_time"):
        when += f" to {r['end_date']} {r['end_time']}" if r.get("end_date") else f" to {r['end_time']}"
    elif r.get("ongoing"):
        when += ", ongoing"
    where_ = "area not given" if r.get("scope") != "island" and not r.get("areas") else where(r)
    head = f"{n}. " if n is not None else ""
    out = f"{head}{r.get('type', '').replace('_', ' ')} ({kind}), {when}, {where_}"
    if r.get("source_url"):
        out += f"\nSource: {r['source_url']}"
    if r.get("note"):
        out += f"\nNote: {r['note'][:300]}"
    return out


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


def _t(v: str) -> str:
    return (v or "")[:16].replace("T", " ")


def describe_item(coll: str, rec: dict) -> str:
    """A draft or published record of any kind, with what is still missing before publishing."""
    if coll == "news":
        return describe(rec)
    lines = [f"[{rec.get('status')}] {coll[:-1]} · {rec.get('slug') or rec.get('id')}"]
    if coll == "events":
        lines.append(f"{rec.get('type', '').replace('_', ' ')}, {rec.get('severity')}, cause {rec.get('cause')}")
        period = f"From {_t(rec.get('start_local', ''))}" + (f" to {_t(rec['end_local'])}" if rec.get("end_local") else ", ongoing")
        source = ", ".join(x for x in (rec.get("source_publisher"), rec.get("source_title"), rec.get("source_published")) if x)
    else:
        lines.append(f"{rec.get('publisher')} announced: {rec.get('announced', '').replace('_', ' ')}")
        period = f"Published {_t(rec.get('published_local', ''))}"
        if rec.get("starts_local"):
            period += f", from {_t(rec['starts_local'])}" + (f" to {_t(rec['ends_local'])}" if rec.get("ends_local") else "")
        source = rec.get("source_title", "")
    lines += [period, f"Where: {where(rec)}", f"Summary: {rec.get('summary_en', '')}"]
    if rec.get("summary_pap"):
        lines.append(f"PAP: {rec['summary_pap']}")
    if source or rec.get("source_url"):
        lines.append(f"Source: {' · '.join(x for x in (source, rec.get('source_url', '')) if x)}")
    if rec.get("status") == "draft" and (gaps := missing(coll, rec)):
        lines.append("Before publishing: " + ", ".join(f"/set {g}" for g in gaps))
    return "\n".join(lines)


def missing(coll: str, rec: dict) -> list[str]:
    """What the CMS will ask for before publishing (cms/pb_hooks/lib/events.js), as /set names."""
    if coll == "events":
        need = {"source": "source_url", "publisher": "source_publisher", "title": "source_title", "published": "source_published"}
        return [k for k, f in need.items() if not rec.get(f)]
    if coll == "notices":
        gaps = [] if rec.get("source_url") else ["source"]
        return gaps + (["publisher"] if rec.get("publisher", "").lower() == UNKNOWN_PUBLISHER else [])
    return []


def publisher_from(url: str) -> str:
    """A first guess at who published a notice, from its link; the editor can /set it."""
    host = (urlparse(url).hostname or "").lower().removeprefix("www.")
    if not host:
        return UNKNOWN_PUBLISHER
    return "Aqualectra" if "aqualectra" in host else host


def report_period(r: dict) -> tuple[str, str]:
    """A report's start and end as CMS local times ('' when not known or still ongoing)."""
    start = f"{r['date']} {r['start_time']}" if r.get("start_time") else r.get("date", "")
    end = ""
    if r.get("end_time") and not r.get("ongoing"):
        end = f"{r.get('end_date') or r['date']} {r['end_time']}"
    return start, end


def report_summary(kind: str, r: dict) -> str:
    """A plain summary made from the report's fields, never from its free text."""
    what = r.get("type", "")
    if kind == "notices":
        what = "load shedding" if what == "load_shedding" else "a possible shortage" if what == "shortage" else "an interruption"
        lead = f"Announced: {what}"
    else:
        lead = (what if what in EVENT_TYPES else "outage").replace("_", " ").capitalize()
    if r.get("scope") == "island":
        return f"{lead} across the island."
    areas = r.get("areas") or []
    if areas:
        return f"{lead} in {', '.join(areas[:-1]) + ' and ' + areas[-1] if len(areas) > 1 else areas[0]}."
    return f"{lead}, area not known."


@dataclass
class Pending:
    action: str  # "publish" | "delete" | "discard" | "restored"
    record_id: str  # "collection|id" for publish and discard, "id|end time" for restored
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
    reports_after: str | None = None  # PocketBase date of the last report announced
    reports_checked: float = 0.0
    current: dict[int, tuple[str, str]] = field(default_factory=dict)  # user -> (collection, id) being edited
    listed: dict[int, list[str]] = field(default_factory=dict)  # user -> report ids of their last /reports

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
            if err.status == 400 and str(err).partition(": ")[2]:
                return chat, f"The CMS refused it: {str(err).partition(': ')[2]}\nNothing was changed."
            return chat, f"The CMS refused or is unreachable ({err.status}). Nothing was changed."

    def _allow(self, user: int) -> bool:
        limit, window = RATE_LIMIT
        now = self.clock()
        recent = [t for t in self.usage.get(user, []) if now - t < window]
        recent.append(now)
        self.usage[user] = recent
        return len(recent) <= limit

    def _now(self) -> dt.datetime:
        return dt.datetime.fromtimestamp(self.clock(), dt.timezone.utc)

    # ---------- commands ----------

    def _dispatch(self, cmd: str, arg: str, user: int, chat: int) -> str:
        if cmd in ("/start", "/help"):
            return HELP
        if cmd == "/news":
            if not arg:
                return "Usage: /news <title>\n<optional text on the next lines>"
            title, body = split_text(arg)
            rec = self.cms.create({"title_en": title, "body_en": body, "status": "draft", "severity": "info"})
            self.current[user] = ("news", rec["id"])
            return f"Draft saved (not public yet).\n\n{describe(rec)}\n\nAdd /pap, /level, /expire … then /publish."
        if cmd in ("/event", "/notice"):
            return self._new_item("events" if cmd == "/event" else "notices", arg, user)
        if cmd == "/reports":
            items = self.cms.open_reports()
            self.listed[user] = [r["id"] for r in items]
            if not items:
                return "No new reports."
            return "\n\n".join(describe_report(r, i + 1) for i, r in enumerate(items)) + "\n\n/event <n> or /notice <n> makes a draft from one; /reject <n> or /spam <n> sets it aside."
        if cmd in ("/reject", "/spam"):
            rid = self._listed(user, arg)
            if not rid:
                return f"Usage: {cmd} <n>, the number from /reports"
            self.cms.update(rid, {"status": "rejected" if cmd == "/reject" else "spam"}, "reports")
            return f"Report {arg} marked as {'rejected' if cmd == '/reject' else 'spam'}."
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
        if cmd == "/ongoing":
            events = self.cms.ongoing_events()
            return "\n\n".join(describe_event(e, i + 1) for i, e in enumerate(events)) or "No ongoing events."
        if cmd == "/restored":
            return self._restored(arg, user)
        if cmd == "/run":
            return self._request_run(chat)
        if cmd == "/status":
            return self._status()
        if cmd in ("/info", "/important"):
            return "Use /level info, /level notice or /level important for news."

        coll, draft = self._draft(user)
        news_only = ("/level", "/link", "/expire", "/pin", "/unpin")
        if cmd in (*news_only, "/pap", "/set", "/show", "/publish", "/discard") and not draft:
            return "No draft. Start one with /news, /event or /notice."
        if cmd == "/show":
            return describe_item(coll, draft)
        if cmd == "/pap":
            if not arg:
                return "Usage: /pap <titulo>\n<teksto>" if coll == "news" else "Usage: /pap <resumen>"
            if coll == "news":
                title, body = split_text(arg)
                return "Papiamentu added.\n\n" + describe(self.cms.update(draft["id"], {"title_pap": title, "body_pap": body}))
            return "Papiamentu added.\n\n" + describe_item(coll, self.cms.update(draft["id"], {"summary_pap": arg[:SUMMARY_MAX]}, coll))
        if cmd == "/set":
            return self._set(coll, draft, arg)
        if cmd == "/publish":
            if gaps := missing(coll, draft):
                return "Not yet: " + ", ".join(f"/set {g}" for g in gaps) + " first.\n\n" + describe_item(coll, draft)
            self.pending[user] = Pending("publish", f"{coll}|{draft['id']}", self.clock() + CONFIRM_SECONDS)
            return f"Publish this on the site?\n\n{describe_item(coll, draft)}\n\nReply /confirm within 10 minutes, or /cancel."
        if cmd == "/discard":
            if coll == "news":
                return "For news use /delete <id> (from /list)."
            self.pending[user] = Pending("discard", f"{coll}|{draft['id']}", self.clock() + CONFIRM_SECONDS)
            return f"Delete this draft? A report it came from goes back to /reports.\n\n{describe_item(coll, draft)}\n\nReply /confirm within 10 minutes, or /cancel."
        if cmd in news_only and coll != "news":
            return f"{cmd} is for news; this draft is {'an event' if coll == 'events' else 'a notice'}. /set lists its fields."
        if cmd == "/level":
            if arg not in ("info", "notice", "important"):
                return "Usage: /level info | notice | important"
            return "Updated.\n\n" + describe(self.cms.update(draft["id"], {"severity": arg}))
        if cmd in ("/pin", "/unpin"):
            return "Updated.\n\n" + describe(self.cms.update(draft["id"], {"pinned": cmd == "/pin"}))
        if cmd == "/link":
            if not re.fullmatch(r"https://\S+", arg):
                return "Links must start with https://"
            return "Link added.\n\n" + describe(self.cms.update(draft["id"], {"link": arg}))
        if cmd == "/expire":
            when = parse_expiry(arg, self._now())
            if not when:
                return "Usage: /expire 3d | 12h | 30m | 2026-10-12"
            return "Expiry set.\n\n" + describe(self.cms.update(draft["id"], {"expiresAt": pb_date(when)}))
        return "Unknown command. /help lists them."

    def _draft(self, user: int) -> tuple[str, dict | None]:
        """The draft this user is working on: the one they last made, else the newest bot draft."""
        if user in self.current:
            coll, rid = self.current[user]
            try:
                rec = self.cms.get(rid, coll)
            except CmsError as err:
                if err.status != 404:
                    raise
                rec = None
            if rec and rec.get("status") == "draft":
                return coll, rec
            del self.current[user]
        rec = self.cms.latest_draft()
        if not rec:
            return "news", None
        return rec.pop("_collection", "news"), rec

    def _listed(self, user: int, arg: str) -> str | None:
        ids = self.listed.get(user, [])
        if re.fullmatch(r"\d{1,2}", arg) and 0 < int(arg) <= len(ids):
            return ids[int(arg) - 1]
        return None

    def _new_item(self, coll: str, arg: str, user: int) -> str:
        cmd = "/event" if coll == "events" else "/notice"
        if not arg:
            return f"Usage: {cmd} <n> (a report from /reports) or {cmd} <summary> for a new one.\nFor how prominent news is, use /level."
        now_local = self._now().astimezone(CURACAO).strftime("%Y-%m-%d %H:%M")
        report = None
        if re.fullmatch(r"\d{1,2}", arg):
            rid = self._listed(user, arg)
            if not rid:
                return f"There is no report {arg}; /reports lists them."
            report = self.cms.get(rid, "reports")
            if report.get("status") != "new":
                return f"Report {arg} was already handled ({report.get('status')}); /reports shows the new ones."
            start, end = report_period(report)
            base = {"scope": report.get("scope", "unknown"), "areas": report.get("areas") or [], "summary_en": report_summary(coll, report)}
            if report.get("source_url"):
                base["source_url"] = report["source_url"]
        else:
            start, end = now_local, ""
            base = {"scope": "unknown", "areas": [], "summary_en": arg[:SUMMARY_MAX]}
        if coll == "events":
            kind = report.get("type") if report else None
            fields = {**base, "type": kind if kind in EVENT_TYPES else "outage", "severity": "minor", "cause": "unknown", "start_local": start, "end_local": end}
        else:
            kind = report.get("type") if report else None
            announced = "load_shedding" if kind == "load_shedding" else "possible_shortage" if kind == "shortage" else "other"
            published = now_local
            if report and report.get("created"):
                published = dt.datetime.fromisoformat(report["created"].replace("Z", "+00:00").replace(" ", "T")).astimezone(CURACAO).strftime("%Y-%m-%d %H:%M")
            fields = {**base, "announced": announced, "publisher": publisher_from(base.get("source_url", "")), "published_local": published, "starts_local": start if report and report.get("start_time") else "", "ends_local": end}
        rec = self.cms.create({**fields, "status": "draft"}, coll)
        self.current[user] = (coll, rec["id"])
        head = "Event" if coll == "events" else "Notice"
        if report:
            self.cms.update(report["id"], {"status": "used", coll[:-1]: rec["id"]}, "reports")
            head += f" draft made from report {arg} (marked as used)"
        else:
            head += " draft saved"
        tail = "Check it, fill in with /set, add /pap, then /publish."
        return f"{head}. Not public yet.\n\n{describe_item(coll, rec)}\n\n{tail}"

    def _set(self, coll: str, draft: dict, arg: str) -> str:
        if coll == "news":
            return "/set is for events and notices; news uses /pap, /level, /link, /expire."
        spec = EVENT_FIELDS if coll == "events" else NOTICE_FIELDS
        name, _, value = arg.partition(" ")
        name, value = name.lower(), value.strip()
        if name not in spec and name != "areas" or not value:
            names = sorted([*spec, "areas"])
            choices = [f"{n}: {' | '.join(spec[n][1])}" for n in names if n in spec and spec[n][1]]
            return "Usage: /set <field> <value>\nFields: " + ", ".join(names) + "\n" + "\n".join(choices) + "\nareas: island | unknown | Punda, Otrobanda\nTimes: 2026-10-13 14:00, or 14:00 for today; none clears."
        if name == "areas":
            if value.lower() in ("island", "unknown"):
                fields = {"scope": value.lower(), "areas": []}
            else:
                fields = {"scope": "areas", "areas": [a.strip() for a in value.split(",") if a.strip()]}
        else:
            f, allowed = spec[name]
            if allowed and value.lower() not in allowed:
                return f"{name} is one of: {' | '.join(allowed)}"
            if f == "source_url" and not re.fullmatch(r"https://\S+", value):
                return "The source must be a public https:// link."
            if f in TIME_FIELDS:
                value = local_time(value, self._now())
            elif allowed:
                value = value.lower()
            elif f == "summary_en":
                value = value[:SUMMARY_MAX]
            fields = {f: value}
        return "Updated.\n\n" + describe_item(coll, self.cms.update(draft["id"], fields, coll))

    def _confirm(self, user: int) -> str:
        p = self.pending.pop(user, None)
        if not p or p.expires < self.clock():
            return "Nothing to confirm (or it expired). Start again."
        if p.action == "publish":
            coll, rid = p.record_id.split("|", 1)
            # an event published by an editor is checked against its source: verified
            fields = {"status": "published", **({"verified": True} if coll == "events" else {})}
            rec = self.cms.update(rid, fields, coll)
            return f"Published.\n\n{describe_item(coll, rec)}"
        if p.action == "discard":
            coll, rid = p.record_id.split("|", 1)
            link = coll[:-1]
            for r in self.cms.list(f'{link} = "{rid}"', "-created", 5, "reports"):
                self.cms.update(r["id"], {"status": "new", link: ""}, "reports")
            self.cms.delete(rid, coll)
            self.current.pop(user, None)
            return "Draft deleted."
        if p.action == "restored":
            rid, end = p.record_id.split("|", 1)
            rec = self.cms.set_event_end(rid, end)
            return f"Done: the site now shows it ended at {rec.get('end_local', end)[:16].replace('T', ' ')}."
        self.cms.delete(p.record_id)
        return "Deleted."

    def _restored(self, arg: str, user: int) -> str:
        parsed = parse_restored(arg, self._now())
        if not parsed:
            return "Usage: /restored, /restored 18:30, or /restored 2 18:30 (number from /ongoing)"
        num, end = parsed
        events = self.cms.ongoing_events()
        if not events:
            return "No ongoing events."
        if num is None and len(events) > 1:
            return "Several events are ongoing; say which one:\n\n" + "\n\n".join(describe_event(e, i + 1) for i, e in enumerate(events))
        idx = (num or 1) - 1
        if not 0 <= idx < len(events):
            return f"There is no event {num}; /ongoing lists them."
        ev = events[idx]
        self.pending[user] = Pending("restored", f"{ev['id']}|{end}", self.clock() + CONFIRM_SECONDS)
        return f"End this event at {end} (Curaçao time)?\n\n{describe_event(ev)}\n\nReply /confirm within 10 minutes, or /cancel."

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
        """Reports finished manual runs and new public reports (called from the polling loop)."""
        out = self._new_reports()
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

    def _new_reports(self) -> list[tuple[int, str]]:
        """New public reports, at most once a minute, to every allowlisted user. Only reports
        sent after the bot started: a restart never repeats old ones."""
        now = self.clock()
        if now - self.reports_checked < 60:
            return []
        self.reports_checked = now
        if self.reports_after is None:
            self.reports_after = pb_date(dt.datetime.fromtimestamp(now, dt.timezone.utc))
            return []
        try:
            items = self.cms.new_reports(self.reports_after)
        except CmsError:
            return []  # the CMS is down: try again next minute
        if not items:
            return []
        self.reports_after = max(i.get("created", "") for i in items) or self.reports_after
        lines = [describe_report(i) for i in items[:5]]
        more = f"\n\n…and {len(items) - 5} more." if len(items) > 5 else ""
        text = (
            ("New report:\n\n" if len(items) == 1 else f"{len(items)} new reports:\n\n")
            + "\n\n".join(lines)
            + more
            + "\n\n/reports numbers them; /event <n> or /notice <n> turns one into a draft."
        )
        return [(user, text) for user in sorted(self.allowed)]

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
