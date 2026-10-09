"""Access rules and hooks of the CMS (spec 7.3, 7.4, 11), against a real PocketBase."""

import datetime as dt
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def iso(delta_hours: float) -> str:
    t = dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=delta_hours)
    return t.strftime("%Y-%m-%d %H:%M:%S.000Z")


def news(**kw):
    item = {"title_en": "Notice", "body_en": "Plain text body.", "status": "published", "severity": "info"}
    item.update(kw)
    return item


def public_titles(pb):
    status, body, _ = pb.call("GET", "/api/collections/news/records?perPage=100")
    assert status == 200
    return {i["title_en"] for i in body["items"]}


# ---------- news visibility ----------


def test_only_live_news_is_public(pb, admin):
    cases = {
        "live": news(title_en="live"),
        "draft": news(title_en="draft", status="draft"),
        "expired": news(title_en="expired", expiresAt=iso(-1)),
        "future": news(title_en="future", publishedAt=iso(+24)),
        "until-tomorrow": news(title_en="until-tomorrow", expiresAt=iso(+24)),
    }
    for item in cases.values():
        status, body, _ = pb.call("POST", "/api/collections/news/records", item, token=admin)
        assert status == 200, body
    titles = public_titles(pb)
    assert {"live", "until-tomorrow"} <= titles
    assert not {"draft", "expired", "future"} & titles


def test_publishing_stamps_the_time(pb, admin):
    status, body, _ = pb.call("POST", "/api/collections/news/records", news(title_en="stamped"), token=admin)
    assert status == 200 and body["publishedAt"], body
    assert body["source"] == "ui" and body["author"] == "admin@example.org"


def test_public_cannot_write_news(pb):
    status, _, _ = pb.call("POST", "/api/collections/news/records", news(title_en="guest"))
    assert status in (400, 401, 403)
    assert "guest" not in public_titles(pb)


def test_public_reads_are_cacheable(pb):
    _, _, headers = pb.call("GET", "/api/collections/news/records")
    assert headers.get("Cache-Control") == "public, max-age=60"


def test_http_links_are_rejected(pb, admin):
    status, _, _ = pb.call("POST", "/api/collections/news/records", news(title_en="bad link", link="http://example.org"), token=admin)
    assert status == 400
    status, _, _ = pb.call("POST", "/api/collections/news/records", news(title_en="good link", link="https://example.org"), token=admin)
    assert status == 200


# ---------- the bot account ----------


def test_bot_writes_news_as_telegram(pb, bot):
    status, body, _ = pb.call("POST", "/api/collections/news/records", news(title_en="from bot", status="draft"), token=bot)
    assert status == 200, body
    assert body["source"] == "telegram" and body["author"].startswith("bot:")
    rid = body["id"]
    status, body, _ = pb.call("PATCH", f"/api/collections/news/records/{rid}", {"status": "published", "source": "ui", "author": "someone"}, token=bot)
    assert status == 200, body
    assert body["source"] == "telegram" and body["author"].startswith("bot:"), "author and source cannot be rewritten"
    assert "from bot" in public_titles(pb)
    status, _, _ = pb.call("DELETE", f"/api/collections/news/records/{rid}", token=bot)
    assert status == 204


def test_bot_cannot_touch_anything_else(pb, bot):
    status, body, _ = pb.call("GET", "/api/collections/sites/records?perPage=1", token=bot)
    site = body["items"][0]
    assert pb.call("PATCH", f"/api/collections/sites/records/{site['id']}", {"name_en": "x"}, token=bot)[0] in (403, 404)
    assert pb.call("POST", "/api/collections/sites/records", {"slug": "x", "name_en": "x", "kind": "wind", "placement": "approximate"}, token=bot)[0] in (400, 403)
    assert pb.call("GET", "/api/collections/bots/records", token=bot)[0] == 403
    assert pb.call("GET", "/api/collections/_superusers/records", token=bot)[0] in (403, 404)
    assert pb.call("GET", "/api/settings", token=bot)[0] in (401, 403)


def test_no_public_sign_up(pb):
    status, _, _ = pb.call("POST", "/api/collections/bots/records", {"email": "x@example.org", "password": "p" * 20, "passwordConfirm": "p" * 20})
    assert status in (400, 403)


# ---------- sites and island ----------


def test_seeded_sites_match_the_snapshot(pb):
    snap = json.loads((ROOT / "data/sites.snapshot.json").read_text())
    _, body, _ = pb.call("GET", "/api/collections/sites/records?sort=sortOrder")
    got = {s["slug"]: s for s in body["items"]}
    assert set(got) == {s["slug"] for s in snap["sites"]}
    tk = got["terakora"]
    assert tk["parks"] == ["Tera Kora I", "Tera Kora II"] and tk["placeholder_uv"] == next(s for s in snap["sites"] if s["slug"] == "terakora")["placeholder_uv"]
    _, island, _ = pb.call("GET", "/api/collections/island/records")
    assert island["items"][0]["version"] == snap["island"]["version"]


def test_public_cannot_write_sites(pb):
    _, body, _ = pb.call("GET", "/api/collections/sites/records?perPage=1")
    rid = body["items"][0]["id"]
    assert pb.call("PATCH", f"/api/collections/sites/records/{rid}", {"name_en": "x"})[0] in (403, 404)


def test_slug_is_permanent(pb, admin):
    _, body, _ = pb.call("GET", "/api/collections/sites/records?filter=(slug='dokweg')", token=admin)
    rid = body["items"][0]["id"]
    status, _, _ = pb.call("PATCH", f"/api/collections/sites/records/{rid}", {"slug": "dokweg2"}, token=admin)
    assert status == 400
    status, body, _ = pb.call("PATCH", f"/api/collections/sites/records/{rid}", {"name_en": "Dokweg power plant"}, token=admin)
    assert status == 200 and body["updatedBy"] == "admin@example.org"


def test_disabled_sites_are_hidden(pb, admin):
    status, body, _ = pb.call(
        "POST", "/api/collections/sites/records",
        {"slug": "retired_site", "name_en": "Retired", "kind": "other", "placement": "approximate", "enabled": False},
        token=admin,
    )
    assert status == 200, body
    _, public, _ = pb.call("GET", "/api/collections/sites/records?perPage=100")
    assert "retired_site" not in {s["slug"] for s in public["items"]}


def test_exact_placement_needs_coordinates(pb, admin):
    status, _, _ = pb.call(
        "POST", "/api/collections/sites/records",
        {"slug": "exact_site", "name_en": "Exact", "kind": "other", "placement": "exact"},
        token=admin,
    )
    assert status == 400


# ---------- settings ----------


def test_privacy_and_rate_limit_settings(pb, admin):
    _, s, _ = pb.call("GET", "/api/settings", token=admin)
    assert s["logs"]["logIP"] is False
    assert s["rateLimits"]["enabled"] is True
    assert s["trustedProxy"]["headers"] == ["X-Forwarded-For"]
    assert s["batch"]["enabled"] is False


def test_cors_only_for_the_site(pb):
    _, _, ok = pb.call("GET", "/api/health", headers={"Origin": "https://grid.example.org"})
    _, _, other = pb.call("GET", "/api/health", headers={"Origin": "https://evil.example"})
    assert ok.get("Access-Control-Allow-Origin") == "https://grid.example.org"
    assert "Access-Control-Allow-Origin" not in other


# ---------- snapshot export (spec 7.4) ----------


def test_export_from_a_fresh_cms_matches_the_committed_snapshot(pb, tmp_path):
    import shutil
    import sys

    sys.path.insert(0, str(ROOT / "pipeline"))
    from tools.export_sites import main as export_main

    out = tmp_path / "sites.snapshot.json"
    shutil.copy(ROOT / "data/sites.snapshot.json", out)
    # sites were edited by other tests in this session (e.g. a disabled site); compare a fresh read
    assert export_main(["--cms", pb.base, "--out", str(out)]) == 0
    exported = json.loads(out.read_text())
    committed = json.loads((ROOT / "data/sites.snapshot.json").read_text())
    assert exported["island"] == committed["island"]
    assert exported["sites"] == committed["sites"]
    assert exported["_comment"] == committed["_comment"]
