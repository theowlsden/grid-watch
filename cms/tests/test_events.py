"""Events and notices in the CMS (spec 8.4): seeds as drafts, forgiving time input, publishing
needs a source, notices expire on their own."""

import datetime as dt

EV = "/api/collections/events/records"
NO = "/api/collections/notices/records"
SOURCE = {"source_publisher": "Aqualectra", "source_title": "Notice", "source_url": "https://example.org/notice", "source_published": "2026-10-13"}


def event(**kw):
    e = {"type": "load_shedding", "severity": "minor", "scope": "unknown", "cause": "supply", "start_local": "2026-10-13 14:00", "summary_en": "Load shedding.", "status": "draft"}
    e.update(kw)
    return e


def public(pb, url):
    status, body, _ = pb.call("GET", f"{url}?perPage=200")
    assert status == 200
    return body["items"]


def test_seed_events_arrive_as_drafts(pb, admin):
    _, body, _ = pb.call("GET", f"{EV}?perPage=200&filter=(author='events.yaml')", token=admin)
    slugs = {i["slug"] for i in body["items"]}
    assert "2025-08-27-blackout" in slugs and len(slugs) == 5
    assert all(i["status"] == "draft" for i in body["items"])
    assert not [i for i in public(pb, EV) if i["author"] == "events.yaml"]


def test_times_are_stored_as_curacao_time_and_the_slug_is_made(pb, admin):
    status, body, _ = pb.call("POST", EV, event(start_local="2026-10-13 14:00", end_local="2026-10-13 18:30"), token=admin)
    assert status == 200, body
    assert body["start_local"] == "2026-10-13T14:00:00-04:00" and body["end_local"] == "2026-10-13T18:30:00-04:00"
    assert body["startsAt"].startswith("2026-10-13 18:00:00")  # UTC
    assert body["slug"].startswith("2026-10-13-load-shedding")
    status, body, _ = pb.call("POST", EV, event(start_local="2026-10-14"), token=admin)
    assert status == 200 and body["start_local"] == "2026-10-14", body


def test_bad_times_are_refused(pb, admin):
    for bad in [{"start_local": "13/10/2026"}, {"start_local": "2026-02-30"}, {"start_local": "2026-10-13 18:00", "end_local": "2026-10-13 17:00"}]:
        status, body, _ = pb.call("POST", EV, event(**bad), token=admin)
        assert status == 400, (bad, body)


def test_publishing_needs_a_public_https_source(pb, admin):
    status, body, _ = pb.call("POST", EV, event(status="published", start_local="2026-10-15 19:00"), token=admin)
    assert status == 400 and "source" in str(body), body
    status, body, _ = pb.call("POST", EV, event(status="published", start_local="2026-10-15 19:00", **{**SOURCE, "source_url": "http://example.org/x"}), token=admin)
    assert status == 400, body
    status, body, _ = pb.call("POST", EV, event(status="published", start_local="2026-10-15 19:00", slug="2026-10-15-published-test", **SOURCE), token=admin)
    assert status == 200, body
    assert body["source_retrieved"], "retrieval date filled in"
    assert "2026-10-15-published-test" in {i["slug"] for i in public(pb, EV)}


def test_areas_go_with_scope_areas(pb, admin):
    status, body, _ = pb.call("POST", EV, event(scope="areas"), token=admin)
    assert status == 400, body
    status, body, _ = pb.call("POST", EV, event(scope="island", areas=["Punda"]), token=admin)
    assert status == 400, body
    status, body, _ = pb.call("POST", EV, event(scope="areas", areas=["Punda", " Otrobanda ", "Punda"], start_local="2026-10-16 14:00"), token=admin)
    assert status == 200, body
    assert body["areas"] == ["Punda", "Otrobanda"]


def notice(**kw):
    n = {"publisher": "Aqualectra", "announced": "load_shedding", "scope": "island", "published_local": "2026-10-13 14:20", "starts_local": "2026-10-13 18:00", "summary_en": "Load shedding from 18:00.", "status": "draft"}
    n.update(kw)
    return n


def test_notices_expire_on_their_own(pb, admin):
    status, body, _ = pb.call("POST", NO, notice(), token=admin)
    assert status == 200, body
    assert body["expiresAt"].startswith("2026-10-14 10:00:00")  # 12 h after the announced start (22:00 UTC + 12 h)
    status, body, _ = pb.call("POST", NO, notice(ends_local="2026-10-13 22:00"), token=admin)
    assert body["expiresAt"].startswith("2026-10-14 04:00:00")  # 2 h after the end
    status, body, _ = pb.call("POST", NO, notice(starts_local="", published_local="2026-10-13 10:00"), token=admin)
    assert body["expiresAt"].startswith("2026-10-14 14:00:00")  # 24 h after publishing


def test_a_notice_is_public_once_published_with_its_source(pb, admin):
    status, body, _ = pb.call("POST", NO, notice(status="published"), token=admin)
    assert status == 400, body
    soon = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=4)).strftime("%Y-%m-%d %H:%M")
    status, body, _ = pb.call("POST", NO, notice(status="published", published_local=soon, starts_local="", source_url="https://example.org/n"), token=admin)
    assert status == 200, body
    # the site asks for notices that have not expired yet
    status, live, _ = pb.call("GET", f"{NO}?filter=(expiresAt>@now)")
    assert status == 200 and body["slug"] in {i["slug"] for i in live["items"]}


def test_an_id_set_by_hand_starts_with_its_date(pb, admin):
    status, body, _ = pb.call("POST", EV, event(slug="2026-01-01-wrong", start_local="2026-10-19 19:00"), token=admin)
    assert status == 400 and "2026-10-19" in str(body), body


def test_public_cannot_write_and_the_bot_only_makes_drafts(pb, bot):
    assert pb.call("POST", EV, event(), token=None)[0] in (400, 401, 403)
    assert pb.call("POST", NO, notice(), token=None)[0] in (400, 401, 403)
    # the Telegram bot (decision 29): drafts only, whatever status it sends
    status, body, _ = pb.call("POST", EV, event(status="published", start_local="2026-10-22 19:00", **SOURCE), token=bot)
    assert status == 200 and body["status"] == "draft" and body["author"].startswith("bot:"), body
    status, body, _ = pb.call("POST", NO, notice(status="published", published_local="2026-10-22 09:00", source_url="https://example.org/n"), token=bot)
    assert status == 200 and body["status"] == "draft", body


def test_public_reads_are_cacheable(pb):
    for url in (EV, NO):
        _, _, headers = pb.call("GET", f"{url}?perPage=1")
        assert headers.get("Cache-Control") == "public, max-age=60"


def test_two_notices_on_one_day_get_their_own_ids(pb, admin):
    a = pb.call("POST", NO, notice(published_local="2026-10-17 09:00"), token=admin)[1]
    b = pb.call("POST", NO, notice(published_local="2026-10-17 15:00"), token=admin)[1]
    assert a["slug"] == "2026-10-17-load-shedding" and b["slug"] == "2026-10-17-load-shedding-2"


def test_export_writes_valid_stored_copies(pb, admin, tmp_path):
    """pipeline/tools/export_events.py turns the published records into events.yaml and
    notices.yaml that pass the repository's validator, with the link between them kept."""
    import importlib.util
    import sys

    import yaml

    from pb_helpers import ROOT

    n = pb.call("POST", NO, notice(status="published", slug="2026-10-18-export", published_local="2026-10-18 14:00", source_url="https://example.org/n18"), token=admin)[1]
    pb.call("POST", EV, event(status="published", slug="2026-10-18-export-ls", start_local="2026-10-18 19:00", scope="areas", areas=["Punda"], notice=n["id"], **SOURCE), token=admin)
    sys.path.insert(0, str(ROOT / "pipeline"))
    spec = importlib.util.spec_from_file_location("export_events", ROOT / "pipeline/tools/export_events.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.main(["--cms", pb.base, "--out-dir", str(tmp_path)]) == 0
    events = yaml.safe_load((tmp_path / "events.yaml").read_text())
    notices = yaml.safe_load((tmp_path / "notices.yaml").read_text())
    ev = next(e for e in events if e["id"] == "2026-10-18-export-ls")
    assert ev["areas"] == ["Punda"] and ev["notice"] == "2026-10-18-export" and ev["start_local"] == "2026-10-18T19:00:00-04:00"
    assert next(x for x in notices if x["id"] == "2026-10-18-export")["event"] == "2026-10-18-export-ls"
    assert not [e for e in events if e["id"] == "2025-08-27-blackout"], "drafts are not exported"
