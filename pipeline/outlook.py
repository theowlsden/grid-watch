"""Builds forecast.json from a weather pull (spec 5.2, 7.1). Pure apart from the inputs given."""

from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

from config import Config
from sources import EnsemblePull, WeatherPull
from stress import WindowInputs, outlook_day

TZ = ZoneInfo("America/Curacao")
DEMAND_POINT = "demand"
LIMITATIONS = [
    "Generator availability is not public",
    "Demand is a weather-based proxy",
    "Wind output is estimated from forecast wind with a generic power curve",
    "Rule-based outlook, not calibrated against events yet",
]


class LeakageError(RuntimeError):
    """An input claims to come from after the issue time (spec 5.3: no leakage)."""


def check_no_leakage(pull: WeatherPull, ensemble: EnsemblePull | None, issued_at: dt.datetime) -> None:
    for label, t in (("model run", pull.run_time), ("retrieval", pull.retrieved_at), ("ensemble run", ensemble.run_time if ensemble else None)):
        if t is not None and t > issued_at:
            raise LeakageError(f"{label} time {t.isoformat()} is after the issue time {issued_at.isoformat()}")


def points_for(sites: list[dict], anchor: tuple[float, float]) -> dict[str, tuple[float, float]]:
    """Wind is read at each enabled wind site, heat at the demand point (Dokweg, else the anchor)."""
    pts = {s["slug"]: (s["lat"], s["lon"]) for s in sites if s["enabled"] and s["kind"] == "wind" and s["lat"] is not None}
    thermal = [s for s in sites if s["enabled"] and s["kind"] == "thermal" and s["lat"] is not None]
    pts[DEMAND_POINT] = (thermal[0]["lat"], thermal[0]["lon"]) if thermal else anchor
    return pts


def first_day(issued_at: dt.datetime, cfg: Config) -> dt.date:
    """Today's evening if the window has not started yet, otherwise tomorrow's."""
    local = issued_at.astimezone(TZ)
    start = dt.time(int(cfg["window_local"]["start"][:2]))
    return local.date() if local.time() < start else local.date() + dt.timedelta(days=1)


def window_values(series_times: list[dt.datetime], values: list, date: dt.date, hours: list[int]) -> list[float] | None:
    by_time = {t: v for t, v in zip(series_times, values)}
    out = []
    for h in hours:
        v = by_time.get(dt.datetime(date.year, date.month, date.day, h, tzinfo=TZ))
        if v is None:
            return None
        out.append(float(v))
    return out


def build_forecast(
    pull: WeatherPull,
    ensemble: EnsemblePull | None,
    cfg: Config,
    issued_at: dt.datetime,
    trigger: str,
    pipeline_version: str,
    points: dict[str, tuple[float, float]] | None = None,
) -> tuple[dict, dict]:
    """Returns (public forecast, archived inputs record)."""
    check_no_leakage(pull, ensemble, issued_at)
    hours = cfg.window_hours
    wind_points = [n for n in pull.points if n != DEMAND_POINT]
    demand = pull.points[DEMAND_POINT]
    days, archived = [], []
    date = first_day(issued_at, cfg)
    for n in range(cfg["days"]):
        wind = {}
        for name in wind_points:
            p = pull.points[name]
            v = window_values(p.times, p.wind_ms_100m, date, hours)
            if v is None:
                break
            wind[name] = v
        temp = window_values(demand.times, demand.temp_c, date, hours)
        rh = window_values(demand.times, demand.rh, date, hours)
        if len(wind) != len(wind_points) or temp is None or rh is None:
            break  # the forecast does not reach this evening completely
        ens = None
        if ensemble:
            idx = {t: i for i, t in enumerate(ensemble.times)}
            rows = [ensemble.members_wind_ms_100m[idx[t]] for t in (dt.datetime(date.year, date.month, date.day, h, tzinfo=TZ) for h in hours) if t in idx]
            rows = [[m for m in r if m is not None] for r in rows]
            ens = rows if len(rows) == len(hours) and all(len(r) >= 4 for r in rows) else None
        day = outlook_day(WindowInputs(date, wind, temp, rh, ens), n, cfg)
        detail = day.pop("_detail")
        days.append(day)
        archived.append({"date": date.isoformat(), "wind_ms_100m": wind, "temp_c": temp, "rh": rh, "ensemble_members": ens, **detail})
        date += dt.timedelta(days=1)
    if len(days) < 3:
        raise RuntimeError(f"only {len(days)} complete evenings in the weather data; at least 3 are needed")

    model_label = {"ecmwf_ifs025": "ECMWF IFS 0.25°"}.get(pull.model, pull.model)
    forecast = {
        "issued_at": issued_at.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "timezone": "America/Curacao",
        "data_mode": "live",
        "model": {"name": cfg["name"], "version": cfg["version"], "label": cfg["label"]},
        "window_local": dict(cfg["window_local"]),
        "days": days,
        "sources": [
            {
                "name": f"Weather data by {pull.attribution['name']} ({model_label})",
                "url": pull.attribution["url"],
                "retrieved_at": pull.retrieved_at.isoformat().replace("+00:00", "Z"),
            }
        ],
        "limitations": LIMITATIONS,
    }
    inputs = {
        "issued_at": forecast["issued_at"],
        "trigger": trigger,
        "pipeline_version": pipeline_version,
        "model": {"name": cfg["name"], "version": cfg["version"], "config_sha256": cfg.sha256},
        "weather": {
            "provider": pull.provider,
            "model": pull.model,
            "run_time": pull.run_time.isoformat().replace("+00:00", "Z") if pull.run_time else None,
            "retrieved_at": forecast["sources"][0]["retrieved_at"],
            "ensemble_model": ensemble.model if ensemble else None,
            "points": {n: list(v) for n, v in (points or {}).items()},
            "requests": pull.request_urls,
        },
        "window_hours_local": hours,
        "days": archived,
    }
    return forecast, inputs
