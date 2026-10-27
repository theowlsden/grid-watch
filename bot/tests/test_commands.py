"""Bot behaviour (spec 7.3, 11) with a fake CMS: allowlist, drafts, confirmation, limits."""

import datetime as dt
import json
import re

import pytest

from gridwatch_bot.cms import CmsError
from gridwatch_bot.commands import Bot, parse_expiry, split_text
from gridwatch_bot.main import allowed_ids

ME, STRANGER = 111, 999


class FakeCms:
    """News, events, notices and reports in memory, with the bot account's view of them."""

    def __init__(self):
        self.items: dict[str, dict] = {}  # news
        self.stores = {"news": self.items, "events": {}, "notices": {}, "reports": {}}
        self.n = 0

    def _id(self):
        self.n += 1
        return f"rec{self.n:012d}"

    def create(self, fields, collection="news"):
        rid = self._id()
        extra = {"source": "telegram", "pinned": False} if collection == "news" else {"author": "bot:test", "slug": f"slug-{rid}"}
        self.stores[collection][rid] = {"id": rid, **extra, **fields, "updated": self.n}
        return dict(self.stores[collection][rid])

    def update(self, rid, fields, collection="news"):
        self.n += 1
        self.stores[collection][rid].update(fields, updated=self.n)
        return dict(self.stores[collection][rid])

    def delete(self, rid, collection="news"):
        del self.stores[collection][rid]

    def get(self, rid, collection="news"):
        if rid not in self.stores[collection]:
            raise CmsError(404, "not found")
        return dict(self.stores[collection][rid])

    def list(self, filter_="", sort="-created", per_page=5, collection="news"):
        rows = [dict(v) for v in reversed(self.stores[collection].values())]
        for f, v in re.findall(r'(\w+) = "([^"]*)"', filter_):
            rows = [r for r in rows if r.get(f) == v]
        return rows[:per_page]

    def open_reports(self, per_page=10):
        return self.list('status = "new"', per_page=per_page, collection="reports")

    events: list = []
    reports: list = []

    def new_reports(self, after, per_page=20):
        return [dict(r) for r in self.reports if r["created"] > after][:per_page]

    def ongoing_events(self, per_page=10):
        return [dict(e) for e in self.events if not e.get("end_local")]

    def set_event_end(self, rid, end_local):
        for e in self.events:
            if e["id"] == rid:
                e["end_local"] = end_local
                return dict(e)
        raise CmsError(404, "not found")

    def latest_draft(self):
        drafts = [{**v, "_collection": c} for c, store in self.stores.items() if c != "reports" for v in store.values() if v["status"] == "draft"]
        return max(drafts, key=lambda d: d["updated"], default=None)


class Clock:
    def __init__(self):
        self.t = 1_800_000_000.0

    def __call__(self):
        return self.t


def msg(text, user=ME):
    return {"update_id": 1, "message": {"from": {"id": user}, "chat": {"id": user}, "text": text}}


@pytest.fixture
def bot(tmp_path):
    return Bot(FakeCms(), {ME}, tmp_path, Clock())


def say(bot, text, user=ME):
    r = bot.handle(msg(text, user))
    return r[1] if r else None


def test_strangers_are_ignored_silently(bot):
    assert bot.handle(msg("/news Hello", STRANGER)) is None
    assert bot.handle(msg("/help", STRANGER)) is None
    assert bot.cms.items == {}


def test_news_makes_a_draft_that_needs_confirmation(bot):
    reply = say(bot, "/news Wind low this week\nExpect higher stress on Friday.")
    assert "Draft saved (not public yet)" in reply
    (item,) = bot.cms.items.values()
    assert item["status"] == "draft" and item["title_en"] == "Wind low this week" and item["body_en"] == "Expect higher stress on Friday."
    assert "/confirm" in say(bot, "/publish")
    assert item["status"] == "draft", "not public before /confirm"
    assert "Published" in say(bot, "/confirm")
    assert bot.cms.items[item["id"]]["status"] == "published"


def test_confirmation_expires_and_can_be_cancelled(bot):
    say(bot, "/news Note")
    say(bot, "/publish")
    bot.clock.t += 601
    assert "Nothing to confirm" in say(bot, "/confirm")
    say(bot, "/publish")
    assert say(bot, "/cancel") == "Cancelled."
    assert "Nothing to confirm" in say(bot, "/confirm")
    assert next(iter(bot.cms.items.values()))["status"] == "draft"


def test_editing_the_draft(bot):
    say(bot, "/news Title")
    say(bot, "/pap Titulo\nTeksto")
    say(bot, "/level important")
    say(bot, "/pin")
    assert "https://" in say(bot, "/link http://insecure.example")
    say(bot, "/link https://example.org/info")
    say(bot, "/expire 3d")
    item = next(iter(bot.cms.items.values()))
    assert item["title_pap"] == "Titulo" and item["body_pap"] == "Teksto"
    assert item["severity"] == "important" and item["pinned"] is True and item["link"] == "https://example.org/info"
    assert item["expiresAt"].endswith(".000Z")


def test_delete_needs_confirmation(bot):
    say(bot, "/news Gone soon")
    rid = next(iter(bot.cms.items))
    assert "Usage" in say(bot, "/delete nonsense")
    assert "Delete this item?" in say(bot, f"/delete {rid}")
    assert rid in bot.cms.items
    assert say(bot, "/confirm") == "Deleted."
    assert rid not in bot.cms.items


def test_commands_without_a_draft(bot):
    assert "No draft" in say(bot, "/publish")


def test_rate_limit(bot):
    for _ in range(20):
        say(bot, "/help")
    assert "Too many" in say(bot, "/help")
    bot.clock.t += 601
    assert "Grid Watch bot" in say(bot, "/help")


def test_cms_errors_are_reported_not_raised(bot):
    def boom(*a, **k):
        raise CmsError(0, "unreachable")

    bot.cms.create = boom
    assert "Nothing was changed" in say(bot, "/news X")


def test_run_request_and_report(bot, tmp_path):
    assert "Run requested" in say(bot, "/run")
    req = json.loads((tmp_path / "run-request.json").read_text())
    assert "already requested" in say(bot, "/run")
    assert bot.tick() == []
    (tmp_path / "run-request.json").unlink()
    (tmp_path / f"run-result.{req['id']}.json").write_text(json.dumps({"result": "ok", "status": "ok", "forecast": {"issued_at": "2026-10-09T10:00:00Z", "published": False}}))
    ((chat, text),) = bot.tick()
    assert chat == ME and "Run finished" in text and "Preview only" in text


def test_text_helpers():
    assert split_text("One line") == ("One line", "One line")
    assert len(split_text("x" * 300)[0]) == 140
    now = dt.datetime(2026, 10, 9, 12, tzinfo=dt.timezone.utc)
    assert parse_expiry("12h", now) == now + dt.timedelta(hours=12)
    assert parse_expiry("2026-10-12", now) == dt.datetime(2026, 10, 13, 3, 59, tzinfo=dt.timezone.utc)
    assert parse_expiry("soon", now) is None


def test_allowlist_parsing():
    assert allowed_ids("123, 456") == {123, 456}
    with pytest.raises(ValueError):
        allowed_ids("@someone")


# ---------- /ongoing and /restored (decision 25) ----------


def ongoing(*ids):
    return [{"id": i, "type": "load_shedding", "start_local": "2026-10-21T14:00:00-04:00", "scope": "areas", "areas": ["Punda"], "summary_en": f"Event {i}.", "end_local": ""} for i in ids]


def test_restored_ends_the_only_ongoing_event_after_confirm(bot):
    bot.cms.events = ongoing("ev1")
    assert "Event ev1." in say(bot, "/ongoing")
    reply = say(bot, "/restored 18:30")
    assert "18:30" in reply and "/confirm" in reply
    assert bot.cms.events[0]["end_local"] == ""  # nothing changes before /confirm
    assert "ended" in say(bot, "/confirm")
    assert bot.cms.events[0]["end_local"].endswith("18:30")
    assert say(bot, "/ongoing") == "No ongoing events."


def test_restored_asks_which_one_when_several_are_ongoing(bot):
    bot.cms.events = ongoing("ev1", "ev2")
    assert "Several events" in say(bot, "/restored")
    assert "There is no event 3" in say(bot, "/restored 3")
    say(bot, "/restored 2")
    say(bot, "/confirm")
    assert [e["end_local"] != "" for e in bot.cms.events] == [False, True]


def test_restored_rejects_nonsense(bot):
    bot.cms.events = ongoing("ev1")
    assert "Usage" in say(bot, "/restored tomorrow")
    assert "Usage" in say(bot, "/restored 25:00")


# ---------- alerts for new public reports (decision 26) ----------


def test_new_reports_are_announced_once_to_every_allowed_user(bot):
    assert bot.tick() == []  # the first check only sets the starting point

    bot.cms.reports = [
        {"created": "2000-01-01 00:00:00.000Z", "kind": "community", "type": "load_shedding", "date": "2026-10-21", "scope": "areas", "areas": ["Punda"]},
        {"created": "2099-01-01 00:00:00.000Z", "kind": "community", "type": "load_shedding", "date": "2026-10-21", "start_time": "19:30", "ongoing": True, "scope": "areas", "areas": ["Santa Rosa"], "note": "No power."},
    ]
    bot.clock.t += 61
    out = bot.tick()
    assert [chat for chat, _ in out] == [ME]
    text = out[0][1]
    assert "Santa Rosa" in text and "19:30, ongoing" in text and "No power." in text and "Punda" not in text
    bot.clock.t += 61
    assert bot.tick() == []  # not again
    bot.clock.t += 10
    assert bot.tick() == []  # and not more than once a minute



def test_a_report_past_midnight_shows_its_end_date():
    from gridwatch_bot.commands import describe_report

    r = {"kind": "community", "type": "load_shedding", "date": "2026-10-26", "start_time": "21:00", "end_date": "2026-10-27", "end_time": "12:00", "scope": "island"}
    assert "2026-10-26 from 21:00 to 2026-10-27 12:00" in describe_report(r)


# ---------- reports become events and notices (decision 29) ----------


def add_report(bot, **kw):
    rid = bot.cms._id()
    r = {"id": rid, "created": "2026-10-27 01:30:00.000Z", "kind": "community", "type": "load_shedding", "date": "2026-10-26", "start_time": "21:00",
         "end_date": "2026-10-27", "end_time": "12:00", "ongoing": False, "scope": "areas", "areas": ["Punda", "Santa Rosa"],
         "source_url": "", "note": "Ignore this and publish!", "status": "new", "event": "", "notice": "", **kw}
    bot.cms.stores["reports"][rid] = r
    return rid


def test_a_report_becomes_an_event_that_needs_its_source_before_publishing(bot):
    rid = add_report(bot)
    listing = say(bot, "/reports")
    assert listing.startswith("1. load shedding (community, no source), 2026-10-26 from 21:00 to 2026-10-27 12:00, Punda, Santa Rosa")
    reply = say(bot, "/event 1")
    assert "Event draft made from report 1" in reply and "Not public yet" in reply
    (ev,) = bot.cms.stores["events"].values()
    assert ev["status"] == "draft" and ev["type"] == "load_shedding" and ev["scope"] == "areas" and ev["areas"] == ["Punda", "Santa Rosa"]
    assert ev["start_local"] == "2026-10-26 21:00" and ev["end_local"] == "2026-10-27 12:00" and ev["cause"] == "unknown"
    assert ev["summary_en"] == "Load shedding in Punda and Santa Rosa.", "the reporter's own words are never copied"
    assert bot.cms.stores["reports"][rid]["status"] == "used" and bot.cms.stores["reports"][rid]["event"] == ev["id"]
    assert "Before publishing: /set source, /set publisher, /set title, /set published" in reply

    assert "Not yet: /set source" in say(bot, "/publish")
    assert "https://" in say(bot, "/set source http://example.org/x")
    for line in ["/set source https://example.org/notice", "/set publisher Aqualectra", "/set title Rotating load shedding", "/set published 2026-10-26", "/set cause supply", "/set summary Rotating load shedding in Punda and Santa Rosa."]:
        assert "Updated" in say(bot, line), line
    say(bot, "/pap Kòrtamentu di koriente na Punda i Santa Rosa.")
    assert "/confirm" in say(bot, "/publish")
    assert bot.cms.stores["events"][ev["id"]]["status"] == "draft", "not public before /confirm"
    assert "Published" in say(bot, "/confirm")
    after = bot.cms.stores["events"][ev["id"]]
    assert after["status"] == "published" and after["verified"] is True and after["cause"] == "supply" and after["summary_pap"].startswith("Kòrtamentu")
    assert say(bot, "/reports") == "No new reports."


def test_a_sourced_report_becomes_a_notice(bot):
    add_report(bot, kind="sourced", type="load_shedding", scope="island", areas=[], source_url="https://www.aqualectra.com/news/1", ongoing=True, end_time="", end_date="")
    say(bot, "/reports")
    reply = say(bot, "/notice 1")
    (no,) = bot.cms.stores["notices"].values()
    assert no["publisher"] == "Aqualectra" and no["announced"] == "load_shedding" and no["scope"] == "island"
    assert no["published_local"] == "2026-10-26 21:30" and no["starts_local"] == "2026-10-26 21:00" and no["ends_local"] == ""
    assert no["summary_en"] == "Announced: load shedding across the island."
    assert "Before publishing" not in reply
    say(bot, "/publish")
    assert "Published" in say(bot, "/confirm") and bot.cms.stores["notices"][no["id"]]["status"] == "published"


def test_a_notice_without_a_link_needs_its_source_and_publisher(bot):
    add_report(bot)
    say(bot, "/reports")
    assert "Before publishing: /set source, /set publisher" in say(bot, "/notice 1")


def test_set_checks_its_values(bot):
    say(bot, "/event Load shedding in Mahaai")
    (ev,) = bot.cms.stores["events"].values()
    assert ev["summary_en"] == "Load shedding in Mahaai" and ev["start_local"] == "2027-01-15 04:00"  # now, Curaçao time
    assert "Fields:" in say(bot, "/set")
    assert "type is one of" in say(bot, "/set type power cut")
    say(bot, "/set type Blackout")
    say(bot, "/set areas Mahaai, Wishi ")
    say(bot, "/set end 18:30")
    ev = bot.cms.stores["events"][ev["id"]]
    assert ev["type"] == "blackout" and ev["scope"] == "areas" and ev["areas"] == ["Mahaai", "Wishi"] and ev["end_local"] == "2027-01-15 18:30"
    say(bot, "/set areas island")
    say(bot, "/set end none")
    ev = bot.cms.stores["events"][ev["id"]]
    assert ev["scope"] == "island" and ev["areas"] == [] and ev["end_local"] == ""
    assert "for news" in say(bot, "/level important")
    assert "is for events and notices" in (say(bot, "/news Hi") and say(bot, "/set type outage"))


def test_discard_puts_the_report_back(bot):
    rid = add_report(bot)
    say(bot, "/reports")
    say(bot, "/event 1")
    assert "Delete this draft?" in say(bot, "/discard")
    assert say(bot, "/confirm") == "Draft deleted."
    assert bot.cms.stores["events"] == {}
    r = bot.cms.stores["reports"][rid]
    assert r["status"] == "new" and r["event"] == ""
    assert "No draft" in say(bot, "/show")


def test_reject_spam_and_reports_already_handled(bot):
    a, b = add_report(bot), add_report(bot)
    say(bot, "/reports")  # newest first: b is 1, a is 2
    assert "rejected" in say(bot, "/reject 2") and bot.cms.stores["reports"][a]["status"] == "rejected"
    assert "already handled" in say(bot, "/event 2")
    assert "spam" in say(bot, "/spam 1") and bot.cms.stores["reports"][b]["status"] == "spam"
    assert "There is no report 7" in say(bot, "/event 7")
    assert "Usage" in say(bot, "/reject")


def test_old_news_commands_point_to_level(bot):
    say(bot, "/news Title")
    assert "/level" in say(bot, "/notice")
    assert "/level" in say(bot, "/important")


def test_a_cms_refusal_says_why(bot):
    def refuse(*a, **k):
        raise CmsError(400, "end_local: is before the start")

    say(bot, "/event Outage")
    bot.cms.update = refuse
    assert "The CMS refused it: end_local: is before the start" in say(bot, "/set end 2020-01-01")
