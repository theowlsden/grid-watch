"""Public reports (decision 26): Turnstile, honeypot, checks, privacy, grouped community counts."""

import datetime as dt
import itertools
from urllib.parse import quote

URL = "/api/collections/reports/records"
_ip = itertools.count(1)


def today():
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=4)).strftime("%Y-%m-%d")


def yesterday():
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=4, days=1)).strftime("%Y-%m-%d")


def send(pb, body, token="good-token", **headers):
    # every report from its own address: the form allows 5 per 10 minutes per address
    h = {"X-Forwarded-For": f"198.51.100.{next(_ip) % 250 + 1}", **headers}
    payload = {**body, **({"cf-turnstile-response": token} if token else {})}
    return pb.call("POST", URL, payload, headers=h)


def by_note(pb, admin, note):
    _, body, _ = pb.call("GET", f"{URL}?filter=" + quote(f"(note='{note}')"), token=admin)
    return body


def report(**kw):
    r = {"kind": "community", "type": "load_shedding", "date": today(), "start_time": "19:30", "scope": "areas", "areas": ["Punda"], "note": "No power."}
    r.update(kw)
    return r


def test_a_report_needs_a_valid_turnstile_token(pb):
    assert send(pb, report(), token=None)[0] == 400
    assert send(pb, report(), token="bad-token")[0] == 400
    status, body, _ = send(pb, report())
    assert status in (200, 204), body


def test_the_honeypot_is_answered_politely_and_nothing_is_saved(pb, admin):
    status, body, _ = send(pb, report(note="honeypot test", website="http://spam.example"))
    assert status == 200 and body == {"status": "received"}
    found = by_note(pb, admin, "honeypot test")
    assert found["items"] == []


def test_reports_are_checked(pb):
    for bad in [
        report(date="2024-12-31"),
        report(date="2099-01-01"),
        report(start_time="7pm"),
        report(start_time="20:00", end_time="19:00"),
        report(end_date=yesterday(), end_time="10:00"),  # before the start date
        report(end_date="2099-01-01", end_time="10:00"),
        report(areas=["Atlantis"]),
        report(scope="areas", areas=[]),
        report(kind="sourced"),
        report(kind="sourced", source_url="http://example.org/x"),
    ]:
        assert send(pb, bad)[0] == 400, bad


def test_names_are_matched_to_the_neighbourhood_list(pb, admin):
    send(pb, report(areas=["punda", "  Otrobanda "], note="case test"))
    found = by_note(pb, admin, "case test")
    assert found["items"][0]["areas"] == ["Punda", "Otrobanda"]


def test_status_starts_as_new_whatever_is_sent(pb, admin):
    send(pb, report(status="used", note="status test"))
    found = by_note(pb, admin, "status test")
    assert found["items"][0]["status"] == "new"


def test_reports_are_private(pb):
    status, body, _ = pb.call("GET", f"{URL}?perPage=5")
    assert status == 200 and body["items"] == []


def test_no_address_or_identity_is_stored(pb, admin):
    send(pb, report(note="privacy test"))
    found = by_note(pb, admin, "privacy test")
    fields = set(found["items"][0])
    assert not fields & {"ip", "email", "name", "user", "author"}


def test_community_counts_are_grouped_and_need_two_reports(pb):
    day = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=4, days=2)).strftime("%Y-%m-%d")
    lone = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=4, days=3)).strftime("%Y-%m-%d")
    for areas in (["Santa Rosa"], ["Santa Rosa", "Mahaai"], ["Mahaai"]):
        send(pb, report(date=day, areas=areas))
    send(pb, report(date=day, scope="island", areas=[]))
    send(pb, report(date=lone, areas=["Punda"]))  # a single report: not shown
    send(pb, report(date=day, kind="sourced", source_url="https://example.org/s"))  # sourced: becomes an event, not a count
    status, body, headers = pb.call("GET", "/api/gridwatch/community?days=14")
    assert status == 200 and headers.get("Cache-Control") == "public, max-age=60"
    days = {d["date"]: d for d in body["items"]}
    assert lone not in days
    d = days[day]
    assert d["total"] == 4 and d["island"] == 1
    assert d["areas"][:2] == [{"name": "Mahaai", "count": 2}, {"name": "Santa Rosa", "count": 2}]
    assert "note" not in str(body) and "No power" not in str(body)


def test_a_report_past_midnight_has_an_end_date(pb, admin):
    status, body, _ = send(pb, report(date=yesterday(), start_time="21:00", end_date=today(), end_time="12:00", note="past midnight"))
    assert status in (200, 204), body
    item = by_note(pb, admin, "past midnight")["items"][0]
    assert item["date"] == yesterday() and item["end_date"] == today() and item["end_time"] == "12:00"
    # the same day as the start is stored as empty; ongoing clears the end
    send(pb, report(end_date=today(), end_time="20:00", note="same day"))
    assert by_note(pb, admin, "same day")["items"][0]["end_date"] == ""
    send(pb, report(date=yesterday(), end_date=today(), end_time="10:00", ongoing=True, note="still out"))
    item = by_note(pb, admin, "still out")["items"][0]
    assert item["end_date"] == "" and item["end_time"] == ""
