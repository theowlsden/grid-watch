"""Bot behaviour (spec 7.3, 11) with a fake CMS: allowlist, drafts, confirmation, limits."""

import datetime as dt
import json

import pytest

from gridwatch_bot.cms import CmsError
from gridwatch_bot.commands import Bot, parse_expiry, split_text
from gridwatch_bot.main import allowed_ids

ME, STRANGER = 111, 999


class FakeCms:
    def __init__(self):
        self.items: dict[str, dict] = {}
        self.n = 0

    def create(self, fields):
        self.n += 1
        rid = f"rec{self.n:012d}"
        self.items[rid] = {"id": rid, "source": "telegram", "pinned": False, **fields}
        return dict(self.items[rid])

    def update(self, rid, fields):
        self.items[rid].update(fields)
        return dict(self.items[rid])

    def delete(self, rid):
        del self.items[rid]

    def get(self, rid):
        if rid not in self.items:
            raise CmsError(404, "not found")
        return dict(self.items[rid])

    def list(self, filter_="", sort="-created", per_page=5):
        return [dict(v) for v in reversed(self.items.values())][:per_page]

    def latest_draft(self):
        drafts = [v for v in self.items.values() if v["status"] == "draft"]
        return dict(drafts[-1]) if drafts else None


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
    say(bot, "/important")
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
    assert "news bot" in say(bot, "/help")


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
