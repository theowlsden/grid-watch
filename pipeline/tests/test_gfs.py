"""NOAA GFS source (decision 18), against a small in-memory dataset shaped like dynamical.org's
archive: no network in tests."""

import datetime as dt
import math

import numpy as np
import pytest
import xarray as xr

from config import load_config
from outlook import build_forecast
from sources.gfs import TZ, Gfs, bilinear, leads_needed, to_hourly

UTC = dt.timezone.utc
CFG = load_config()
POINTS = {"terakora": (12.228, -69.016), "dokweg": (12.125, -68.912)}


def fake_dataset(inits: list[dt.datetime], nan_after_h: int | None = None) -> xr.Dataset:
    """Grid and lead times as in the real archive; u=3, v=4 (5 m/s) everywhere, warm and humid."""
    lat = np.array([12.75, 12.5, 12.25, 12.0, 11.75])  # descending, like the archive
    lon = np.arange(-69.5, -68.24, 0.25)
    hours = list(range(0, 121)) + list(range(123, 385, 3))
    lead = np.array([np.timedelta64(h, "h") for h in hours]).astype("timedelta64[us]")
    shape = (len(inits), len(hours), len(lat), len(lon))
    data = {
        "wind_u_100m": np.full(shape, 3.0, dtype="float32"),
        "wind_v_100m": np.full(shape, 4.0, dtype="float32"),
        "temperature_2m": np.full(shape, 30.0, dtype="float32"),
        "relative_humidity_2m": np.full(shape, 70.0, dtype="float32"),
    }
    if nan_after_h is not None:
        k = hours.index(nan_after_h)
        for arr in data.values():
            arr[-1, k:] = np.nan  # the newest run is still being published
    dims = ("init_time", "lead_time", "latitude", "longitude")
    return xr.Dataset(
        {name: (dims, arr) for name, arr in data.items()},
        coords={"init_time": np.array([np.datetime64(t.replace(tzinfo=None)) for t in inits]), "lead_time": lead, "latitude": lat, "longitude": lon},
    )


# ---------- helpers ----------


def test_bilinear_corners_middle_and_outside():
    lats, lons = [12.5, 12.25], [-69.0, -68.75]  # latitudes descending
    grid = [[0.0, 1.0], [2.0, 3.0]]
    assert bilinear(lats, lons, grid, 12.5, -69.0) == 0.0
    assert bilinear(lats, lons, grid, 12.25, -68.75) == 3.0
    assert bilinear(lats, lons, grid, 12.375, -68.875) == pytest.approx(1.5)
    assert bilinear(lats, lons, grid, 13.0, -68.875) is None
    assert bilinear(lats, lons, [[0.0, math.nan], [2.0, 3.0]], 12.375, -68.875) is None


def test_three_hour_gaps_are_filled_longer_ones_are_not():
    t0 = dt.datetime(2026, 10, 10, 18, tzinfo=TZ)
    times = [t0, t0 + dt.timedelta(hours=3), t0 + dt.timedelta(hours=9)]
    t, v = to_hourly(times, [0.0, 3.0, 9.0])
    assert len(t) == 10 and all(b - a == dt.timedelta(hours=1) for a, b in zip(t, t[1:]))
    assert v[:4] == [0.0, 1.0, 2.0, 3.0]
    assert v[4:9] == [None] * 5 and v[9] == 9.0
    _, v = to_hourly(times[:2], [0.0, None])
    assert v == [0.0, None, None, None]


def test_leads_cover_the_last_local_day():
    init = dt.datetime(2026, 10, 10, 0, tzinfo=UTC)  # 20:00 on 9 Oct in Curaçao
    # to the end of 9 Oct + 8 days, local: 18 Oct 00:00 local = 04:00 UTC, 196 h after the run
    assert leads_needed(init, 8) == 196
    assert leads_needed(init, 30) == 384


# ---------- the source ----------


def test_pull_gives_hourly_local_series_from_the_run():
    init = dt.datetime(2026, 10, 10, 0, tzinfo=UTC)
    pull = Gfs(fake_dataset([init])).pull(POINTS, 8, init)
    assert pull.provider == "noaa-gfs" and pull.run_time == init
    s = pull.points["dokweg"]
    assert s.times[0] == init.astimezone(TZ) and s.times[0].tzinfo is TZ
    assert all(b - a == dt.timedelta(hours=1) for a, b in zip(s.times, s.times[1:]))
    # past 120 h the 3-hourly values are filled in, so the evening hours are all there
    assert all(w == pytest.approx(5.0) for w in s.wind_ms_100m)
    assert set(s.temp_c) == {30.0} and set(s.rh) == {70.0}
    assert "dynamical.org" in pull.attribution["name"]


def test_an_unfinished_newest_run_falls_back_to_the_one_before():
    a = dt.datetime(2026, 10, 10, 0, tzinfo=UTC)
    b = dt.datetime(2026, 10, 10, 6, tzinfo=UTC)
    src = Gfs(fake_dataset([a, b], nan_after_h=150))
    assert src.forecast(POINTS, 8, "gfs025").run_time == a
    assert Gfs(fake_dataset([a, b])).forecast(POINTS, 8, "gfs025").run_time == b


def test_latest_init_respects_a_cutoff():
    inits = [dt.datetime(2026, 10, 10, h, tzinfo=UTC) for h in (0, 6, 12)]
    src = Gfs(fake_dataset(inits))
    assert src.latest_init() == inits[-1]
    assert src.latest_init(not_after=dt.datetime(2026, 10, 10, 11, tzinfo=UTC)) == inits[1]
    with pytest.raises(RuntimeError):
        src.latest_init(not_after=dt.datetime(2026, 10, 9, tzinfo=UTC))


def test_gfs_feeds_the_rules_for_every_day():
    init = dt.datetime(2026, 10, 10, 0, tzinfo=UTC)
    issued = dt.datetime(2026, 10, 10, 10, tzinfo=UTC)  # 06:00 in Curaçao
    pts = {"terakora": (12.228, -69.016), "playakanoa": (12.170, -68.851), "koraaltabak": (12.135, -68.810), "demand": (12.125, -68.912)}
    pull = Gfs(fake_dataset([init])).pull(pts, CFG["days"] + 1, init)
    pull.retrieved_at = issued  # as if fetched at the issue time (the leakage guard checks it)
    forecast, inputs = build_forecast(pull, None, CFG, issued, "scheduled", "t", pts)
    assert len(forecast["days"]) == CFG["days"]
    assert inputs["weather"]["provider"] == "noaa-gfs"
    assert inputs["weather"]["ensemble_model"] is None  # confidence from the horizon alone
    assert forecast["sources"][0]["name"] == "Weather data by NOAA GFS via dynamical.org (GFS 0.25°)"
