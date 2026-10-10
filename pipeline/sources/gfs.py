"""NOAA GFS source (decision 18), read from dynamical.org's Zarr copy of the NOAA archive on AWS
Open Data: CC BY 4.0, commercial use allowed, every run since 1 May 2021, so the same code
serves the live outlook and the Phase 3 hindcasts. Credit: "NOAA GFS via dynamical.org".

A point read loads one forecast run for a small box around Curaçao: about 14 MB and 15 s for
seven days of 100 m wind, 2 m temperature and humidity. Values are interpolated bilinearly from
the 0.25 degree grid (about 27 km, so the island spans only a few cells). GFS is hourly up to
120 h and 3-hourly after that; the 3-hourly stretch is filled in linearly to hourly so every
evening hour has a value. GFS has no ensemble here: confidence then uses the horizon alone."""

from __future__ import annotations

import datetime as dt
import math
from zoneinfo import ZoneInfo

from .base import EnsemblePull, PointSeries, WeatherPull

TZ = ZoneInfo("America/Curacao")
# Pinned like a dependency: a new dataset version gets a new prefix; read its notes before moving.
BUCKET = "dynamical-noaa-gfs"
PREFIX = "noaa-gfs-forecast/v0.2.7.icechunk"
REGION = "us-west-2"
CATALOG_URL = "https://dynamical.org/catalog/noaa-gfs-forecast/"
ATTRIBUTION = {"name": "NOAA GFS via dynamical.org", "url": CATALOG_URL}
MODEL = "gfs025"  # the only model here; the config's `model` names Open-Meteo models
VARIABLES = ["wind_u_100m", "wind_v_100m", "temperature_2m", "relative_humidity_2m"]
# Box around the island; the grid lines are every 0.25 degrees.
BOX = {"lat": (12.0, 12.5), "lon": (-69.25, -68.5)}
MAX_GAP_H = 3  # longest gap filled in when making the series hourly


# ---------- pure helpers (unit-tested) ----------


def bilinear(lats: list[float], lons: list[float], grid: list[list[float]], lat: float, lon: float) -> float | None:
    """Bilinear interpolation on a regular grid; `grid[i][j]` is at (lats[i], lons[j]).
    Latitudes may run either way. None when the point is outside or a corner is missing."""
    li = _bracket(lats, lat)
    lj = _bracket(lons, lon)
    if li is None or lj is None:
        return None
    (i0, i1, fy), (j0, j1, fx) = li, lj
    corners = [grid[i0][j0], grid[i0][j1], grid[i1][j0], grid[i1][j1]]
    if any(c is None or (isinstance(c, float) and math.isnan(c)) for c in corners):
        return None
    top = corners[0] * (1 - fx) + corners[1] * fx
    bottom = corners[2] * (1 - fx) + corners[3] * fx
    return float(top * (1 - fy) + bottom * fy)


def _bracket(axis: list[float], x: float) -> tuple[int, int, float] | None:
    for k in range(len(axis) - 1):
        a, b = axis[k], axis[k + 1]
        lo, hi = min(a, b), max(a, b)
        if lo <= x <= hi:
            return k, k + 1, (x - a) / (b - a) if b != a else 0.0
    return None


def to_hourly(times: list[dt.datetime], values: list[float | None], max_gap_h: int = MAX_GAP_H) -> tuple[list[dt.datetime], list[float | None]]:
    """Fill gaps of up to `max_gap_h` hours linearly so the series is hourly. Longer gaps, and
    gaps next to a missing value, stay missing."""
    out_t: list[dt.datetime] = []
    out_v: list[float | None] = []
    for k, (t, v) in enumerate(zip(times, values)):
        if k:
            prev_t, prev_v = times[k - 1], values[k - 1]
            gap = int((t - prev_t).total_seconds() // 3600)
            for h in range(1, gap):
                out_t.append(prev_t + dt.timedelta(hours=h))
                fill = gap <= max_gap_h and prev_v is not None and v is not None
                out_v.append(prev_v + (v - prev_v) * h / gap if fill else None)  # type: ignore[operator]
        out_t.append(t)
        out_v.append(v)
    return out_t, out_v


def wind_speed(u: float | None, v: float | None) -> float | None:
    return None if u is None or v is None else math.hypot(u, v)


def leads_needed(init: dt.datetime, days: int) -> int:
    """Hours from the run's start to the end of the last local day asked for."""
    local_start = init.astimezone(TZ).date()
    end = dt.datetime(local_start.year, local_start.month, local_start.day, tzinfo=TZ) + dt.timedelta(days=days + 1)
    return min(384, math.ceil((end - init).total_seconds() / 3600))


# ---------- dataset access ----------


def open_dataset():  # noqa: ANN201 - xarray is imported lazily
    import icechunk
    import xarray as xr

    storage = icechunk.s3_storage(bucket=BUCKET, prefix=PREFIX, region=REGION, anonymous=True)
    repo = icechunk.Repository.open(storage)
    return xr.open_zarr(repo.readonly_session("main").store, consolidated=False, chunks=None)


def lead_hours(box) -> list[float]:  # noqa: ANN001
    import numpy as np

    return [float(h) for h in box.lead_time.values / np.timedelta64(1, "h")]


def point_series(box, var: str, lat: float, lon: float) -> list[float | None]:  # noqa: ANN001
    """One variable at one point, interpolated for every lead time in the box."""
    lats = [float(x) for x in box.latitude.values]
    lons = [float(x) for x in box.longitude.values]
    arr = box[var].values  # (lead, lat, lon)
    return [bilinear(lats, lons, arr[k].tolist(), lat, lon) for k in range(arr.shape[0])]


def _utc(t) -> dt.datetime:  # noqa: ANN001 - numpy datetime64
    return dt.datetime.fromisoformat(str(t)[:19]).replace(tzinfo=dt.timezone.utc)


class Gfs:
    name = "noaa-gfs"

    def __init__(self, dataset=None):  # noqa: ANN001 - an xarray Dataset (tests pass a small one)
        self._ds = dataset

    @property
    def ds(self):  # noqa: ANN201
        if self._ds is None:
            self._ds = open_dataset()
        return self._ds

    def box(self, init: dt.datetime, n_leads: int, variables: list[str] = VARIABLES):  # noqa: ANN201
        """One run's values for the box around the island, lead times up to `n_leads` hours."""
        import numpy as np

        ds = self.ds
        lat_desc = float(ds.latitude[0]) > float(ds.latitude[-1])
        lat_slice = slice(BOX["lat"][1], BOX["lat"][0]) if lat_desc else slice(*BOX["lat"])
        sub = ds[variables].sel(init_time=np.datetime64(init.replace(tzinfo=None)), latitude=lat_slice, longitude=slice(*BOX["lon"]))
        hours = (sub.lead_time.values / np.timedelta64(1, "h")).astype(int)
        keep = int((hours <= n_leads).sum())
        return sub.isel(lead_time=slice(0, keep)).load()

    def pull(self, points: dict[str, tuple[float, float]], days: int, init: dt.datetime, box=None) -> WeatherPull:  # noqa: ANN001
        """Point series from one forecast run (UTC init time); `box` reuses values already loaded."""
        if box is None:
            box = self.box(init, leads_needed(init, days))
        valid = [init + dt.timedelta(hours=h) for h in lead_hours(box)]
        out = {}
        for name, (lat, lon) in points.items():

            def series(var: str) -> list[float | None]:
                return point_series(box, var, lat, lon)

            u, v = series("wind_u_100m"), series("wind_v_100m")
            local = [t.astimezone(TZ) for t in valid]
            times, wind = to_hourly(local, [wind_speed(a, b) for a, b in zip(u, v)])
            _, temp = to_hourly(local, series("temperature_2m"))
            _, rh = to_hourly(local, series("relative_humidity_2m"))
            out[name] = PointSeries(times, wind, temp, rh)
        return WeatherPull(
            provider=self.name,
            model=MODEL,
            run_time=init,
            retrieved_at=dt.datetime.now(dt.timezone.utc).replace(microsecond=0),
            points=out,
            attribution=ATTRIBUTION,
            request_urls=[f"s3://{BUCKET}/{PREFIX} {','.join(VARIABLES)} init={init:%Y-%m-%dT%H}Z lat={BOX['lat']} lon={BOX['lon']}"],
        )

    def latest_init(self, not_after: dt.datetime | None = None) -> dt.datetime:
        """The newest run, optionally no later than `not_after` (UTC)."""
        inits = [_utc(t) for t in self.ds.init_time.values]
        if not_after is not None:
            inits = [t for t in inits if t <= not_after]
        if not inits:
            raise RuntimeError("no GFS run available")
        return inits[-1]

    # ---------- WeatherSource ----------

    def forecast(self, points: dict[str, tuple[float, float]], days: int, model: str) -> WeatherPull:
        """The newest run whose evening hours are all filled in. A run is published in parts,
        so the newest one may still be incomplete; then the one before it is used."""
        inits = [_utc(t) for t in self.ds.init_time.values][-3:]
        for init in reversed(inits):
            pull = self.pull(points, days, init)
            # complete when every value up to the last full day is there
            series = next(iter(pull.points.values()))
            cutoff = series.times[-1] - dt.timedelta(days=1)
            if all(w is not None for t, w in zip(series.times, series.wind_ms_100m) if t <= cutoff):
                return pull
        raise RuntimeError("the last three GFS runs are all incomplete")

    def ensemble(self, point: tuple[float, float], days: int, model: str) -> EnsemblePull | None:
        return None
