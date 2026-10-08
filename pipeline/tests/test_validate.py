"""Schema and rule checks for every published JSON file (spec 11, unit tests)."""

import copy
import json

import pytest

from events import build_events, dumps, load_events_yaml
from paths import EVENTS_JSON, EVENTS_YAML, FORECAST_JSON, SITES_SNAPSHOT
from validate import Report, check_events, check_events_built, check_forecast, check_sites, level_from_index, main


@pytest.fixture
def forecast():
    return json.loads(FORECAST_JSON.read_text())


@pytest.fixture
def sites():
    return json.loads(SITES_SNAPSHOT.read_text())


@pytest.fixture
def events():
    return load_events_yaml(EVENTS_YAML)


SLUGS = {"terakora", "dokweg", "playakanoa", "koraaltabak"}


# ---------- committed files ----------


def test_repository_files_pass():
    assert main([]) == 0


def test_strict_fails_while_sources_are_todo():
    assert main(["--strict"]) == 1


def test_events_json_matches_yaml():
    report = Report()
    check_events_built(EVENTS_YAML, EVENTS_JSON, report)
    assert report.ok, report.errors


# ---------- levels (spec 5.1 thresholds) ----------


@pytest.mark.parametrize(
    "index,level",
    [(0, "low"), (24.9, "low"), (25, "moderate"), (44, "moderate"), (45, "elevated"), (59, "elevated"), (60, "high"), (100, "high")],
)
def test_level_thresholds(index, level):
    assert level_from_index(index) == level


# ---------- forecast ----------


def test_example_forecast_is_valid(forecast):
    report = Report()
    check_forecast(forecast, report, SLUGS)
    assert report.ok, report.errors
    assert forecast["data_mode"] == "example"


def test_level_must_match_index(forecast):
    forecast["days"][0]["index"] = 70
    report = Report()
    check_forecast(forecast, report, SLUGS)
    assert any("does not match index" in e for e in report.errors)


def test_dates_must_be_consecutive(forecast):
    forecast["days"][2]["date"] = forecast["days"][3]["date"]
    report = Report()
    check_forecast(forecast, report, SLUGS)
    assert any("consecutive" in e for e in report.errors)


def test_capacity_is_always_unknown(forecast):
    forecast["days"][0]["drivers"]["capacity"] = "ok"
    report = Report()
    check_forecast(forecast, report, SLUGS)
    assert not report.ok


def test_probability_fields_are_rejected(forecast):
    forecast["days"][0]["probability"] = 0.18
    report = Report()
    check_forecast(forecast, report, SLUGS)
    assert any("probability" in e for e in report.errors)


def test_unknown_site_slug_is_a_warning(forecast):
    forecast["days"][0]["sites"]["solarpark"] = {"status": "low"}
    report = Report()
    check_forecast(forecast, report, SLUGS)
    assert report.ok
    assert any("solarpark" in w for w in report.warnings)


def test_live_forecast_needs_sources(forecast):
    forecast["data_mode"] = "live"
    report = Report()
    check_forecast(forecast, report, SLUGS)
    assert any("sources" in e for e in report.errors)


def test_issued_at_must_be_utc(forecast):
    forecast["issued_at"] = "2026-10-07T08:00:00-04:00"
    report = Report()
    check_forecast(forecast, report, SLUGS)
    assert not report.ok


# ---------- events ----------


def test_seed_events_are_valid(events):
    report = Report()
    check_events(events, report, strict=False)
    assert report.ok, report.errors
    assert len(events) == 5


def test_todo_sources_fail_in_strict_mode(events):
    report = Report()
    check_events(events, report, strict=True)
    assert len(report.errors) == len(events)


def test_filled_sources_pass_strict(events):
    e = copy.deepcopy(events[0])
    e["sources"] = [
        {"publisher": "Example", "title": "Report", "url": "https://example.org/report", "published_at": "2025-08-28", "retrieved_at": "2026-10-08"}
    ]
    report = Report()
    check_events([e], report, strict=True)
    assert report.ok, report.errors


def test_event_needs_a_source(events):
    events[0]["sources"] = []
    report = Report()
    check_events(events, report, strict=False)
    assert not report.ok


def test_http_source_is_rejected(events):
    events[0]["sources"][0]["url"] = "http://example.org"
    report = Report()
    check_events(events, report, strict=False)
    assert not report.ok


def test_event_time_needs_curacao_offset(events):
    events[0]["start_local"] = "2025-08-27T02:30:00Z"
    report = Report()
    check_events(events, report, strict=False)
    assert not report.ok


def test_duplicate_event_ids(events):
    events.append(copy.deepcopy(events[0]))
    report = Report()
    check_events(events, report, strict=False)
    assert any("duplicate" in e for e in report.errors)


def test_end_before_start(events):
    events[1]["end_local"] = "2026-04-24"
    report = Report()
    check_events(events, report, strict=False)
    assert any("before start" in e for e in report.errors)


def test_build_sorts_chronologically(events):
    shuffled = list(reversed(events))
    built = build_events(shuffled)
    assert [e["id"] for e in built] == sorted(e["id"] for e in events)
    assert dumps(built).endswith("\n")


def test_out_of_date_json_is_reported(tmp_path, events):
    stale = tmp_path / "events.json"
    stale.write_text(dumps(events[:2]))
    report = Report()
    check_events_built(EVENTS_YAML, stale, report)
    assert any("out of date" in e for e in report.errors)


# ---------- sites ----------


def test_sites_snapshot_is_valid(sites):
    report = Report()
    assert check_sites(sites, report) == SLUGS
    assert report.ok, report.errors


def test_terakora_parks(sites):
    tk = next(s for s in sites["sites"] if s["slug"] == "terakora")
    assert tk["parks"] == ["Tera Kora I", "Tera Kora II"]


def test_bad_slug_is_rejected(sites):
    sites["sites"][0]["slug"] = "Tera Kora"
    report = Report()
    check_sites(sites, report)
    assert not report.ok


def test_exact_placement_needs_coordinates(sites):
    sites["sites"][0]["placement"] = "exact"
    report = Report()
    check_sites(sites, report)
    assert any("exact" in e for e in report.errors)


def test_coordinates_must_be_on_curacao(sites):
    sites["sites"][0]["lat"], sites["sites"][0]["lon"] = 52.37, 4.89
    report = Report()
    check_sites(sites, report)
    assert not report.ok
