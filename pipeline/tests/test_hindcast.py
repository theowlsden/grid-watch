"""Hindcasts (spec 5.3, decision 20): no leakage, reproducible from stored inputs, resumable."""

import datetime as dt

import pytest

from config import load_config
from hindcast import AIRPORT_MAX_LEAD_H, done_issues, hindcast_issue, issue_times, pick_init, read_records, rescore, write_records
from outlook import LeakageError, build_forecast
from sources.gfs import Gfs
from test_gfs import fake_dataset

UTC = dt.timezone.utc
CFG = load_config()
PTS = {"terakora": (12.228, -69.016), "playakanoa": (12.170, -68.851), "koraaltabak": (12.135, -68.810), "demand": (12.125, -68.912)}


def runs(day: dt.date) -> list[dt.datetime]:
    return [dt.datetime(day.year, day.month, day.day, h, tzinfo=UTC) for h in (0, 6, 12, 18)]


def test_issue_times_follow_the_local_schedule():
    times = issue_times(dt.date(2025, 8, 26), dt.date(2025, 8, 27))
    assert [t.strftime("%d %H:%M") for t in times] == ["26 10:00", "26 20:00", "27 10:00", "27 20:00"]  # 06:00 and 16:00 in Curaçao


def test_only_runs_published_by_the_issue_time_are_used():
    inits = runs(dt.date(2025, 8, 26))
    morning, afternoon = issue_times(dt.date(2025, 8, 26), dt.date(2025, 8, 26))
    assert pick_init(inits, morning) == inits[0]  # 00 UTC; the 06 UTC run is not out by 10 UTC
    assert pick_init(inits, afternoon) == inits[2]  # 12 UTC
    assert pick_init(inits, inits[0] + dt.timedelta(hours=5)) is None
    for t in issue_times(dt.date(2025, 8, 26), dt.date(2025, 8, 26)):
        assert pick_init(inits, t) + dt.timedelta(hours=6) <= t


def test_a_run_published_after_the_issue_time_is_refused():
    init = dt.datetime(2025, 8, 26, 6, tzinfo=UTC)
    with pytest.raises(ValueError):
        hindcast_issue(Gfs(fake_dataset([init])), init, dt.datetime(2025, 8, 26, 10, tzinfo=UTC), CFG, PTS)


def test_retrospective_mode_still_refuses_a_run_from_after_the_issue_time():
    init = dt.datetime(2025, 8, 26, 12, tzinfo=UTC)
    pull = Gfs(fake_dataset([init])).pull(PTS, CFG["days"] + 1, init)
    with pytest.raises(LeakageError):
        build_forecast(pull, None, CFG, init - dt.timedelta(hours=1), "hindcast", "t", PTS, retrospective=True)


@pytest.fixture(scope="module")
def record():
    init = dt.datetime(2025, 8, 26, 0, tzinfo=UTC)
    return hindcast_issue(Gfs(fake_dataset([init])), init, dt.datetime(2025, 8, 26, 10, tzinfo=UTC), CFG, PTS)


def test_record_holds_outlook_inputs_and_airport_series(record):
    assert record["issued_at"] == "2025-08-26T10:00:00Z" and record["issue_local"] == "06:00"
    assert record["run_time"] == "2025-08-26T00:00:00Z"
    assert record["rules"]["config_sha256"] == CFG.sha256
    assert len(record["days"]) == CFG["days"]
    day = record["days"][0]
    assert set(day["inputs"]["wind_ms_100m"]) == {"terakora", "playakanoa", "koraaltabak"}
    air = record["airport"]
    # native lead times only: hourly to 120 h, then every 3 hours, none filled in
    assert air["lead_h"][:3] == [0, 1, 2] and 121 not in air["lead_h"] and max(air["lead_h"]) <= AIRPORT_MAX_LEAD_H
    assert set(air["wind_ms_10m"]) == {1.0}


def test_rescoring_the_stored_inputs_reproduces_the_outlook(record):
    for n, day in enumerate(record["days"]):
        again = rescore(day, n, CFG)
        assert (again["index"], again["level"], again["confidence"]) == (day["index"], day["level"], day["confidence"])


def test_records_are_merged_sorted_and_resumable(tmp_path, record):
    later = {**record, "issued_at": "2025-08-26T20:00:00Z"}
    write_records(tmp_path, [later])
    write_records(tmp_path, [record, {**later, "issue_local": "replaced"}])
    rows = read_records(tmp_path / "2025-08.jsonl")
    assert [r["issued_at"] for r in rows] == ["2025-08-26T10:00:00Z", "2025-08-26T20:00:00Z"]
    assert rows[1]["issue_local"] == "replaced"
    assert done_issues(tmp_path) == {"2025-08-26T10:00:00Z", "2025-08-26T20:00:00Z"}
