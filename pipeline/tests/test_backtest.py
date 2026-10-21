"""Backtest (spec 5.3) on small hand-made hindcasts: no leakage in the baselines, honest counts."""

import datetime as dt

import pytest

from backtest import TZ, case_studies, confusion, detection, predictions, to_events, warning_times, weather_error
from config import load_config
from observations import Observation, parse_iem

UTC = dt.timezone.utc
CFG = load_config()
START = dt.date(2025, 8, 1)


def record(issue_day: dt.date, indexes: list[int], hour_local: int = 6) -> dict:
    issued = dt.datetime(issue_day.year, issue_day.month, issue_day.day, hour_local, tzinfo=TZ).astimezone(UTC)
    run = issued.replace(hour=0 if hour_local == 6 else 12)
    days = []
    for n, ix in enumerate(indexes):
        d = issue_day + dt.timedelta(days=n)
        days.append(
            {
                "date": d.isoformat(),
                "index": ix,
                "level": "high" if ix >= 60 else "elevated" if ix >= 45 else "moderate" if ix >= 25 else "low",
                "confidence": "high",
                "inputs": {"wind_ms_100m": {"terakora": [10.0, 10.0, 10.0]}, "temp_c": [29.0] * 3, "rh": [75.0] * 3},
            }
        )
    return {
        "issued_at": issued.isoformat().replace("+00:00", "Z"),
        "issue_local": f"{hour_local:02d}:00",
        "run_time": run.isoformat().replace("+00:00", "Z"),
        "days": days,
        "airport": {"id": "TNCC", "lead_h": [0, 6, 30], "wind_ms_10m": [6.0, 7.0, 8.0], "temp_c": [28.0, 28.0, 30.0]},
    }


EVENT = {"id": "2025-08-20-test", "start_local": "2025-08-20", "end_local": None, "type": "outage", "severity": "minor", "cause": "supply"}


def test_events_dates_and_starts():
    ev = to_events([EVENT, {**EVENT, "id": "b", "start_local": "2025-08-27T02:30:00-04:00", "end_local": "2025-08-28"}])
    assert ev[0].start == dt.datetime(2025, 8, 20, 19, tzinfo=TZ)  # date only: the evening window
    assert ev[1].dates == (dt.date(2025, 8, 27), dt.date(2025, 8, 28))


def test_baselines_only_know_events_that_had_started():
    events = to_events([EVENT])
    before = record(dt.date(2025, 8, 20), [10])  # 06:00 on the event day, before 19:00
    after = record(dt.date(2025, 8, 21), [10])
    p_before, p_after = predictions([before, after], events, CFG, START)
    assert p_before.scores["persistence"] == 0.0 and p_before.scores["base_rate"] == 0.0
    assert p_after.scores["persistence"] == 100.0 and p_after.scores["base_rate"] > 0


def test_seasonal_needs_a_full_earlier_month():
    p = predictions([record(dt.date(2025, 8, 25), [10])], [], CFG, START)[0]
    assert p.scores["seasonal"] is None  # 24 days of this August are not an earlier August
    p = predictions([record(dt.date(2025, 9, 30), [10])], [], CFG, START)[0]
    assert p.scores["seasonal"] is None
    p = predictions([record(dt.date(2026, 8, 25), [10])], [], CFG, dt.date(2025, 8, 1))[0]
    assert p.scores["seasonal"] == 0.0


def test_confusion_and_scoring_window():
    events = to_events([EVENT])
    recs = [record(dt.date(2025, 8, 18), [10, 20, 70]), record(dt.date(2025, 8, 21), [65])]
    preds = predictions(recs, events, CFG, START)
    outcome = {dt.date(2025, 8, 18) + dt.timedelta(days=k): k == 2 for k in range(4)}
    c = confusion(preds, outcome, "rules", 60)
    assert (c["tp"], c["fp"], c["fn"], c["tn"]) == (1, 1, 0, 2)
    assert c["precision"] == 0.5 and c["recall"] == 1.0
    # evenings after the coverage end are not scored
    det = detection(preds, events, dt.date(2025, 8, 18), dt.date(2025, 8, 20))
    assert det["evenings"] == 3 and det["event_evenings"] == 1


def test_warning_time_is_the_first_issue_at_or_above_before_the_start():
    events = to_events([EVENT])
    recs = [record(dt.date(2025, 8, 15), [10] * 5 + [50]), record(dt.date(2025, 8, 17), [10, 10, 10, 70]), record(dt.date(2025, 8, 21), [90])]
    w = warning_times(predictions(recs, events, CFG, START), events, 45)[0]
    assert w["first_issue"] == "2025-08-15T10:00:00Z"
    assert w["hours_ahead"] == pytest.approx(5 * 24 + 13)  # 06:00 on the 15th to 19:00 on the 20th


def test_weather_error_matches_valid_times():
    rec = record(dt.date(2025, 8, 18), [10])
    run = dt.datetime.fromisoformat(rec["run_time"].replace("Z", "+00:00"))
    obs = {run: Observation(run, 5.0, 27.0, 80.0), run + dt.timedelta(hours=30): Observation(run, 9.0, 31.0, 80.0)}
    err = weather_error([rec], obs)
    first = err["wind_ms_10m"][0]
    assert first["n"] == 1 and first["bias"] == 1.0
    day_two = next(b for b in err["wind_ms_10m"] if b["lead_h_from"] == 24)
    assert day_two["bias"] == -1.0 and err["temp_c"][3]["bias"] == -1.0


def test_case_study_uses_the_latest_issue_before_each_cutoff():
    events = to_events([EVENT])
    recs = [record(dt.date(2025, 8, 13), [10] * 8), record(dt.date(2025, 8, 19), [10, 55]), record(dt.date(2025, 8, 20), [62])]
    rows = {r["at"]: r for r in case_studies(recs, events)[0]["rows"]}
    assert rows["T-7 d"]["issued_at"] == "2025-08-13T10:00:00Z" and rows["T-7 d"]["index"] == 10
    assert rows["T-24 h"]["issued_at"] == "2025-08-19T10:00:00Z" and rows["T-24 h"]["level"] == "elevated"
    assert rows["T-1 h"]["issued_at"] == "2025-08-20T10:00:00Z" and rows["T-1 h"]["index"] == 62


def test_iem_rows_convert_to_metric():
    rows = parse_iem("station,valid,tmpf,relh,drct,sknt,gust\nTNCC,2025-08-26 00:00,84.20,83.93,80.00,12.00,\nTNCC,2025-08-26 01:00,,,,,\n")
    assert rows[0] == {"valid_utc": "2025-08-26T00:00Z", "wind_kt": 12.0, "wind_ms": 6.17, "wind_dir_deg": 80.0, "gust_kt": None, "temp_c": 29.0, "rh": 83.93}
    assert rows[1]["wind_ms"] is None and rows[1]["temp_c"] is None


def test_report_markdown_with_events_has_every_section():
    from backtest import caveats, level_frequency
    from tools.run_backtest import NAMES, markdown

    events = to_events([EVENT])
    recs = [record(dt.date(2025, 8, 13), [10] * 8), record(dt.date(2025, 8, 19), [10, 55]), record(dt.date(2025, 8, 20), [62])]
    preds = predictions(recs, events, CFG, START)
    rep = {
        "label": "test",
        "generated_at": "now",
        "rules": {"name": "rules-v0", "version": "0"},
        "hindcasts": {"count": 3, "first": recs[0]["issued_at"], "last": recs[-1]["issued_at"], "source": {"name": "NOAA GFS via dynamical.org"}},
        "events": {"sourced": 1, "coverage": ["2025-08-13", "2025-08-21"]},
        "caveats": caveats(1, 0, None),
        "weather_error": weather_error(recs, {}),
        "level_frequency": level_frequency(recs),
        "detection": detection(preds, events, dt.date(2025, 8, 13), dt.date(2025, 8, 21)),
        "case_studies": case_studies(recs, events),
        "methods": NAMES,
    }
    md = markdown(rep)
    for heading in ("## Read this first", "## A. Weather", "### 0 days ahead", "### Calibration", "### Warning time", "### 2025-08-20-test"):
        assert heading in md, heading
    assert "Very small sample: 1 event evening." in md
    assert "would have indicated" in md and "predicted" not in md


def test_every_caveat_has_a_site_message_with_the_same_placeholders():
    import json
    import re

    from backtest import CAVEAT_TEXT
    from paths import ROOT

    en = json.loads((ROOT / "web" / "src" / "i18n" / "en.json").read_text())
    for cid, text in CAVEAT_TEXT.items():
        key = f"results.caveat.{cid}"
        assert key in en, key
        python_params = set(re.findall(r"\{(\w+)", text)) - {"s"}
        site_params = set(re.findall(r"\{(\w+)\}", en[key]))
        assert python_params == site_params, cid


def test_only_supply_related_events_are_outcomes():
    from backtest import counts_as_outcome

    assert counts_as_outcome({"type": "outage", "cause": "supply"})
    assert counts_as_outcome({"type": "load_shedding", "cause": "unknown"})
    assert not counts_as_outcome({"type": "outage", "cause": "network"})
    assert not counts_as_outcome({"type": "outage", "cause": "unknown"})  # could be a local fault
    local = {**EVENT, "id": "2025-08-21-cable", "start_local": "2025-08-21", "type": "outage", "cause": "network"}
    assert [e.id for e in to_events([EVENT, local])] == ["2025-08-20-test"]
