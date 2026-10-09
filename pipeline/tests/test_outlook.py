"""Phase 2 unit tests (spec 11): power curve, thresholds, window selection in America/Curacao,
the no-leakage guard, the weather-source parsing and a full run with a fake source."""

import datetime as dt
import json
import os
import stat
from zoneinfo import ZoneInfo

import pytest

from config import load_config
from outlook import LeakageError, build_forecast, check_no_leakage, first_day, points_for, window_values
from power_curve import output_fraction
from sources import EnsemblePull, PointSeries, WeatherPull
from sources.open_meteo import OpenMeteo
from stress import confidence, demand_proxy, heat_index_c, level, site_status
from validate import THRESHOLDS, Report, check_forecast

TZ = ZoneInfo("America/Curacao")
CFG = load_config()
UTC = dt.timezone.utc


# ---------- power curve ----------


@pytest.mark.parametrize("v,frac", [(0, 0), (2.9, 0), (3, 0), (12, 1), (20, 1), (25, 0), (30, 0)])
def test_power_curve_limits(v, frac):
    assert output_fraction(v) == pytest.approx(frac)


def test_power_curve_is_cubic_and_rising():
    assert output_fraction(7) == pytest.approx((7**3 - 27) / (1728 - 27))
    vals = [output_fraction(v / 2) for v in range(6, 25)]
    assert vals == sorted(vals)


# ---------- rules ----------


def test_config_levels_match_the_validator():
    assert {name: start for start, name in THRESHOLDS} == CFG["levels"]


@pytest.mark.parametrize("i,lv", [(0, "low"), (24, "low"), (25, "moderate"), (44, "moderate"), (45, "elevated"), (60, "high"), (100, "high")])
def test_levels(i, lv):
    assert level(i, CFG) == lv


def test_heat_index_reference_values():
    # NWS table: 30 C at 70 % feels about 35 C; low humidity stays close to the temperature
    assert heat_index_c(30, 70) == pytest.approx(35.0, abs=0.7)
    assert heat_index_c(25, 40) == pytest.approx(24.6, abs=0.7)


def test_demand_proxy_is_clamped():
    assert demand_proxy(20, CFG) == 0 and demand_proxy(50, CFG) == 1


def test_site_status_follows_wind():
    assert [site_status(w, CFG) for w in (4, 6, 9)] == ["high", "elevated", "low"]


def test_confidence_from_horizon_and_spread():
    assert [confidence(d, None, CFG) for d in (0, 1, 2, 3, 4, 6)] == ["high", "high", "medium", "medium", "low", "low"]
    assert confidence(0, 5.0, CFG) == "medium"
    assert confidence(5, 5.0, CFG) == "low"


# ---------- window selection in America/Curacao ----------


def test_first_day_is_today_before_the_window_and_tomorrow_after():
    before = dt.datetime(2026, 10, 9, 22, 59, tzinfo=UTC)  # 18:59 local
    after = dt.datetime(2026, 10, 9, 23, 0, tzinfo=UTC)  # 19:00 local
    assert first_day(before, CFG) == dt.date(2026, 10, 9)
    assert first_day(after, CFG) == dt.date(2026, 10, 10)
    # 02:00 UTC is still the previous evening locally (UTC-4)
    assert first_day(dt.datetime(2026, 10, 10, 2, 0, tzinfo=UTC), CFG) == dt.date(2026, 10, 10)


def test_window_hours_are_local_19_to_21():
    assert CFG.window_hours == [19, 20, 21]
    times = [dt.datetime(2026, 10, 9, h, tzinfo=TZ) for h in range(24)]
    assert window_values(times, list(range(24)), dt.date(2026, 10, 9), CFG.window_hours) == [19, 20, 21]
    assert window_values(times[:20], list(range(20)), dt.date(2026, 10, 9), CFG.window_hours) is None


# ---------- fake weather ----------


def fake_pull(issued: dt.datetime, wind: float = 9.0, days: int = 8, run_time: dt.datetime | None = None) -> WeatherPull:
    start = issued.astimezone(TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    times = [start + dt.timedelta(hours=h) for h in range(24 * days)]
    series = lambda: PointSeries(times, [wind] * len(times), [28.5] * len(times), [80.0] * len(times))  # noqa: E731
    return WeatherPull(
        provider="fake",
        model="test",
        run_time=run_time or issued - dt.timedelta(hours=8),
        retrieved_at=issued,
        points={"terakora": series(), "playakanoa": series(), "koraaltabak": series(), "demand": series()},
        attribution={"name": "Test", "url": "https://example.org"},
    )


ISSUED = dt.datetime(2026, 10, 9, 10, 0, tzinfo=UTC)


def test_no_leakage_guard():
    check_no_leakage(fake_pull(ISSUED), None, ISSUED)
    with pytest.raises(LeakageError):
        check_no_leakage(fake_pull(ISSUED, run_time=ISSUED + dt.timedelta(hours=1)), None, ISSUED)
    with pytest.raises(LeakageError):
        build_forecast(fake_pull(ISSUED, run_time=ISSUED + dt.timedelta(minutes=1)), None, CFG, ISSUED, "scheduled", "t")


def test_forecast_matches_the_schema_and_rules():
    forecast, inputs = build_forecast(fake_pull(ISSUED), None, CFG, ISSUED, "scheduled", "t")
    report = Report()
    check_forecast(forecast, report, {"terakora", "playakanoa", "koraaltabak", "dokweg"})
    assert report.ok, report.errors
    assert forecast["data_mode"] == "live" and len(forecast["days"]) == 7
    assert forecast["days"][0]["date"] == "2026-10-09"
    assert all("_detail" not in d for d in forecast["days"])
    assert inputs["model"]["config_sha256"] == CFG.sha256 and inputs["weather"]["run_time"] == "2026-10-09T02:00:00Z"
    assert forecast["sources"][0]["name"] == "Weather data by Test (test)"


def test_low_wind_raises_the_index():
    calm, _ = build_forecast(fake_pull(ISSUED, wind=4.5), None, CFG, ISSUED, "scheduled", "t")
    steady, _ = build_forecast(fake_pull(ISSUED, wind=11.5), None, CFG, ISSUED, "scheduled", "t")
    assert calm["days"][0]["index"] > steady["days"][0]["index"]
    assert calm["days"][0]["sites"]["terakora"]["status"] == "high"
    assert steady["days"][0]["level"] == "low"


def test_too_short_a_forecast_fails():
    with pytest.raises(RuntimeError, match="at least 3"):
        build_forecast(fake_pull(ISSUED, days=2), None, CFG, ISSUED, "scheduled", "t")


def test_points_for_sites():
    sites = [
        {"slug": "a", "kind": "wind", "enabled": True, "lat": 12.2, "lon": -69.0},
        {"slug": "b", "kind": "wind", "enabled": False, "lat": 12.1, "lon": -68.9},
        {"slug": "d", "kind": "thermal", "enabled": True, "lat": 12.12, "lon": -68.91},
    ]
    assert points_for(sites, (12.19, -68.97)) == {"a": (12.2, -69.0), "demand": (12.12, -68.91)}


# ---------- Open-Meteo parsing ----------


def test_open_meteo_parsing():
    hourly = {"time": ["2026-10-09T19:00", "2026-10-09T20:00"], "wind_speed_100m": [10.1, 9.5], "temperature_2m": [29, 28.8], "relative_humidity_2m": [80, 81]}
    data = [{"hourly": hourly, "hourly_units": {"wind_speed_100m": "m/s"}}] * 2
    pts = OpenMeteo.parse_points(data, ["a", "b"])
    assert pts["a"].times[0] == dt.datetime(2026, 10, 9, 19, tzinfo=TZ) and pts["b"].wind_ms_100m == [10.1, 9.5]
    with pytest.raises(ValueError):
        OpenMeteo.parse_points([{"hourly": hourly, "hourly_units": {"wind_speed_100m": "km/h"}}], ["a"])
    times, members = OpenMeteo.parse_ensemble({"hourly": {"time": hourly["time"], "wind_speed_100m": [1, 2], "wind_speed_100m_member01": [3, 4]}})
    assert members == [[1, 3], [2, 4]]


def test_api_key_is_never_in_recorded_urls(monkeypatch):
    om = OpenMeteo(api_key="secret-key")
    monkeypatch.setattr(om, "_get", lambda url, params: [{"hourly": {"time": [], "wind_speed_100m": [], "temperature_2m": [], "relative_humidity_2m": []}}])
    monkeypatch.setattr(om, "run_time", lambda model: None)
    pull = om.forecast({"a": (12.1, -68.9)}, 7, "ecmwf_ifs025")
    assert all("secret-key" not in u for u in pull.request_urls)
    assert pull.request_urls[0].startswith("https://customer-api.open-meteo.com/")


# ---------- full run with a fake source ----------


class FakeSource:
    def __init__(self, wind=9.0, fail=False):
        self.wind, self.fail = wind, fail

    def forecast(self, points, days, model):
        if self.fail:
            raise RuntimeError("weather service down")
        return fake_pull(ISSUED, self.wind)

    def ensemble(self, point, days, model):
        return None


@pytest.fixture
def run_daily(tmp_path, monkeypatch):
    import importlib

    monkeypatch.setenv("GRIDWATCH_DATA_DIR", str(tmp_path))
    import run_daily as rd

    importlib.reload(rd)
    return rd


def test_full_run_archives_and_previews(run_daily, tmp_path, monkeypatch):
    monkeypatch.delenv("GRIDWATCH_PUBLISH", raising=False)
    assert run_daily.run("scheduled", FakeSource(), ISSUED) == 0
    assert (tmp_path / "data/preview/forecast.json").exists()
    assert not (tmp_path / "data/forecast.json").exists(), "nothing is published unless GRIDWATCH_PUBLISH is on"
    arch = list((tmp_path / "data/history").rglob("*.json"))
    assert len(arch) == 1 and arch[0].name == "1000-scheduled.json"
    assert not os.stat(arch[0]).st_mode & stat.S_IWUSR, "archive files are read-only"
    hb = json.loads((tmp_path / "data/heartbeat.json").read_text())
    assert hb["status"] == "ok" and hb["forecast"]["published"] is False


def test_publishing_and_append_only_archive(run_daily, tmp_path, monkeypatch):
    monkeypatch.setenv("GRIDWATCH_PUBLISH", "1")
    assert run_daily.run("scheduled", FakeSource(), ISSUED) == 0
    assert json.loads((tmp_path / "data/forecast.json").read_text())["data_mode"] == "live"
    # the same issuance again must not overwrite the archive
    assert run_daily.run("scheduled", FakeSource(), ISSUED) == 1
    hb = json.loads((tmp_path / "data/heartbeat.json").read_text())
    assert hb["status"] == "error" and hb["last_good_forecast"]["issued_at"] == "2026-10-09T10:00:00Z"


def test_failed_run_keeps_the_last_good_data(run_daily, tmp_path, monkeypatch):
    monkeypatch.setenv("GRIDWATCH_PUBLISH", "1")
    assert run_daily.run("scheduled", FakeSource(), ISSUED) == 0
    before = (tmp_path / "data/forecast.json").read_text()
    assert run_daily.run("scheduled", FakeSource(fail=True), ISSUED + dt.timedelta(hours=6)) == 1
    assert (tmp_path / "data/forecast.json").read_text() == before
    hb = json.loads((tmp_path / "data/heartbeat.json").read_text())
    assert hb["status"] == "error" and hb["last_good_forecast"]["issued_at"] == "2026-10-09T10:00:00Z"


def test_manual_runs_are_rate_limited(run_daily, tmp_path):
    assert run_daily.run("manual", FakeSource(), ISSUED) == 0
    assert run_daily.run("manual", FakeSource(), ISSUED + dt.timedelta(minutes=10)) == 2
    assert run_daily.run("manual", FakeSource(), ISSUED + dt.timedelta(minutes=31)) in (0, 1)  # allowed (fake data repeats the issue time)
