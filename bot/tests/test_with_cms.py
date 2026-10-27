"""The bot against a real PocketBase with the committed migrations (spec 11): drafts are not
public until /publish is confirmed, and the bot account can only touch what it is meant to:
news, its own event and notice drafts, the end of a published event, a report's status."""

import os
import socket
import subprocess
import sys
import time
import urllib.request
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bot"))

from gridwatch_bot.cms import Cms, CmsError  # noqa: E402
from gridwatch_bot.commands import Bot  # noqa: E402

BOT = ("bot@example.org", "bot-password-1234567")
SUPER = ("admin@example.org", "admin-password-1234567")


@pytest.fixture(scope="module")
def base(tmp_path_factory):
    binary = os.environ.get("POCKETBASE_BIN")
    if not binary:
        pytest.skip("POCKETBASE_BIN not set")
    data = tmp_path_factory.mktemp("pb")
    args = [f"--dir={data}", f"--migrationsDir={ROOT / 'cms/pb_migrations'}", f"--hooksDir={ROOT / 'cms/pb_hooks'}", "--hooksWatch=false"]
    env = {**os.environ, "PB_SEED_FILE": str(ROOT / "data/sites.snapshot.json"), "PB_BOT_EMAIL": BOT[0], "PB_BOT_PASSWORD": BOT[1]}
    subprocess.run([binary, "migrate", "up", *args], env=env, check=True, capture_output=True)
    subprocess.run([binary, "superuser", "upsert", *SUPER, *args], env=env, check=True, capture_output=True)
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    proc = subprocess.Popen([binary, "serve", f"--http=127.0.0.1:{port}", *args], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    url = f"http://127.0.0.1:{port}"
    for _ in range(100):
        try:
            urllib.request.urlopen(f"{url}/api/health", timeout=1)
            break
        except OSError:
            time.sleep(0.1)
    yield url
    proc.terminate()
    proc.wait(timeout=10)


@pytest.fixture(scope="module")
def cms(base):
    # one signed-in client: sign-ins are rate-limited (2 per 3 s, cms/pb_migrations settings)
    c = Cms(base, *BOT)
    c.token()
    return c


def public_titles(base):
    with urllib.request.urlopen(f"{base}/api/collections/news/records?perPage=100") as r:
        return {i["title_en"] for i in json.loads(r.read())["items"]}


def test_bot_flow_against_pocketbase(base, cms, tmp_path):
    bot = Bot(cms, {1}, tmp_path)
    say = lambda t: bot.handle({"message": {"from": {"id": 1}, "chat": {"id": 1}, "text": t}})[1]  # noqa: E731
    assert "Draft saved" in say("/news Telegram test\nBody text")
    assert "Telegram test" not in public_titles(base), "a draft is not public"
    assert "Telegram test" in say("/show")
    say("/level notice")
    assert "/confirm" in say("/publish")
    assert "Telegram test" not in public_titles(base)
    assert "Published" in say("/confirm")
    assert "Telegram test" in public_titles(base)
    rid = cms.list('title_en = "Telegram test"')[0]["id"]
    say(f"/delete {rid}")
    assert say("/confirm") == "Deleted."
    assert "Telegram test" not in public_titles(base)


def test_bot_account_is_limited_to_news(cms):
    for method, path in [("GET", "/api/collections/bots/records"), ("GET", "/api/settings"), ("POST", "/api/collections/sites/records")]:
        with pytest.raises(CmsError) as err:
            cms._call(method, path, {} if method == "POST" else None)
        assert err.value.status in (400, 401, 403, 404)


def test_wrong_password_is_reported(base):
    time.sleep(3.2)  # let the sign-in rate limit window pass
    with pytest.raises(CmsError) as err:
        Cms(base, BOT[0], "wrong-password-123456").token()
    assert err.value.status == 400


_TOKENS: dict[str, str] = {}


def _admin_call(base, method, path, body=None):
    def req(m, p, b, token=None):
        r = urllib.request.Request(base + p, data=json.dumps(b).encode() if b is not None else None, method=m, headers={"Content-Type": "application/json"})
        if token:
            r.add_header("Authorization", token)
        with urllib.request.urlopen(r) as res:
            return json.loads(res.read())

    # one sign-in per test run: sign-ins are rate-limited (2 per 3 s)
    if base not in _TOKENS:
        _TOKENS[base] = req("POST", "/api/collections/_superusers/auth-with-password", {"identity": SUPER[0], "password": SUPER[1]})["token"]
    return req(method, path, body, _TOKENS[base])


def test_bot_closes_an_ongoing_event_and_nothing_else(base, cms):
    ev = _admin_call(base, "POST", "/api/collections/events/records", {
        "type": "load_shedding", "severity": "minor", "scope": "areas", "areas": ["Punda"], "cause": "supply",
        "start_local": "2026-10-21 14:00", "summary_en": "Load shedding in Punda.", "status": "published",
        "source_publisher": "Aqualectra", "source_title": "Notice", "source_url": "https://example.org/n", "source_published": "2026-10-21",
    })
    assert [e["id"] for e in cms.ongoing_events()] == [ev["id"]]
    rec = cms.set_event_end(ev["id"], "2026-10-21 18:30")
    assert rec["end_local"] == "2026-10-21T18:30:00-04:00" and rec["endsAt"].startswith("2026-10-21 22:30")
    assert cms.ongoing_events() == []
    # the bot cannot rewrite the event itself
    cms._call("PATCH", f"/api/collections/events/records/{ev['id']}", {"summary_en": "Changed by the bot", "status": "draft"})
    after = _admin_call(base, "GET", f"/api/collections/events/records/{ev['id']}")
    assert after["summary_en"] == "Load shedding in Punda." and after["status"] == "published"
    assert after["updatedBy"].startswith("bot:")
    # nor touch drafts
    draft = _admin_call(base, "POST", "/api/collections/events/records", {
        "type": "outage", "severity": "minor", "scope": "unknown", "cause": "unknown", "start_local": "2026-10-20", "summary_en": "Draft.", "status": "draft",
    })
    with pytest.raises(CmsError):
        cms.set_event_end(draft["id"], "2026-10-20 12:00")



def public_events(base, coll="events"):
    with urllib.request.urlopen(f"{base}/api/collections/{coll}/records?perPage=200") as r:
        return {i["slug"]: i for i in json.loads(r.read())["items"]}


def test_a_report_becomes_a_published_event_through_the_bot(base, cms):
    report = _admin_call(base, "POST", "/api/collections/reports/records", {
        "kind": "community", "type": "load_shedding", "date": "2026-10-26", "start_time": "21:00", "end_date": "2026-10-27", "end_time": "12:00",
        "scope": "areas", "areas": ["Punda"], "note": "bot flow test",
    })
    bot = Bot(cms, {1})
    say = lambda t: bot.handle({"message": {"from": {"id": 1}, "chat": {"id": 1}, "text": t}})[1]  # noqa: E731
    listing = say("/reports")
    n = next(line.split(".")[0] for line in listing.splitlines() if "2026-10-26 from 21:00 to 2026-10-27 12:00" in line)
    assert "Event draft made" in say(f"/event {n}")
    slug = "2026-10-26-load-shedding"
    assert slug not in public_events(base), "a draft is not public"
    after = _admin_call(base, "GET", f"/api/collections/reports/records/{report['id']}")
    assert after["status"] == "used" and after["event"] and after["note"] == "bot flow test"
    assert "The CMS refused it" in say("/set end 2026-10-26 20:00")  # before the start: the hook says why
    for line in ["/set source https://example.org/ls", "/set publisher Aqualectra", "/set title Load shedding", "/set published 2026-10-26", "/set cause supply"]:
        assert "Updated" in say(line), line
    say("/publish")
    assert "Published" in say("/confirm")
    ev = public_events(base)[slug]
    assert ev["end_local"] == "2026-10-27T12:00:00-04:00" and ev["verified"] is True and ev["author"].startswith("bot:")
    # published: the bot is back to setting the end time only
    cms.update(ev["id"], {"summary_en": "Changed later by the bot"}, "events")
    assert public_events(base)[slug]["summary_en"] == "Load shedding in Punda."


def test_the_bot_cannot_publish_directly_or_touch_others_drafts(base, cms):
    rec = cms.create({"publisher": "Aqualectra", "announced": "other", "scope": "island", "published_local": "2026-10-25 10:00",
                      "summary_en": "Straight to the site?", "source_url": "https://example.org/x", "status": "published"}, "notices")
    assert rec["status"] == "draft", "the bot only makes drafts"
    cms.update(rec["id"], {"status": "published"}, "notices")
    with pytest.raises(CmsError):
        cms.update(rec["id"], {"summary_en": "Changed after publishing"}, "notices")
    admin_draft = _admin_call(base, "POST", "/api/collections/notices/records", {
        "publisher": "Aqualectra", "announced": "other", "scope": "island", "published_local": "2026-10-25 11:00", "summary_en": "Editor draft.", "status": "draft",
    })
    for call in (lambda: cms.get(admin_draft["id"], "notices"), lambda: cms.update(admin_draft["id"], {"status": "published"}, "notices"), lambda: cms.delete(admin_draft["id"], "notices")):
        with pytest.raises(CmsError):
            call()


def test_the_bot_changes_only_a_reports_status(base, cms):
    report = _admin_call(base, "POST", "/api/collections/reports/records", {"kind": "community", "type": "outage", "date": "2026-10-25", "scope": "island", "note": "keep me"})
    cms.update(report["id"], {"status": "rejected", "note": "rewritten", "scope": "unknown"}, "reports")
    after = _admin_call(base, "GET", f"/api/collections/reports/records/{report['id']}")
    assert after["status"] == "rejected" and after["note"] == "keep me" and after["scope"] == "island"
