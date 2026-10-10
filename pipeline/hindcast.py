"""Hindcasts (spec 5.3, decision 20): what the outlook would have said at past issue times,
computed now from archived GFS runs. They are retrospective, never presented as forecasts that
were issued at the time, and kept apart from the live archive.

No leakage: an issue time T only uses the newest GFS run that had been published by T (run
start + AVAILABLE_AFTER). Each record keeps the evening inputs, so the rules can be re-run on
them later (rescore) without downloading again, plus GFS 10 m wind and 2 m temperature at Hato
airport for the forecast-error check against the METAR (5.3 A)."""

from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
from zoneinfo import ZoneInfo

from config import Config
from outlook import build_forecast
from sources.gfs import MODEL, PREFIX, VARIABLES, Gfs, lead_hours, leads_needed, point_series, wind_speed
from stress import WindowInputs, outlook_day

TZ = ZoneInfo("America/Curacao")
# NOAA publishes a GFS run about 3.5 to 5 hours after its start; dynamical.org adds it soon
# after. Six hours is on the safe side: 06:00 local (10 UTC) gets the 00 UTC run, 16:00 local
# (20 UTC) the 12 UTC run, as the live pipeline would.
AVAILABLE_AFTER = dt.timedelta(hours=6)
ISSUE_LOCAL = ("06:00", "16:00")  # the live schedule (deploy/pipeline/crontab)
# Hato airport (METAR TNCC), coordinates from the Iowa Environmental Mesonet station list.
AIRPORT = {"id": "TNCC", "lat": 12.18885, "lon": -68.9598}
AIRPORT_VARIABLES = ["wind_u_10m", "wind_v_10m"]
AIRPORT_MAX_LEAD_H = 168
LABEL = "Retrospective: computed later from archived NOAA GFS runs; not an outlook issued at the time"


def issue_times(start: dt.date, end: dt.date, local: tuple[str, ...] = ISSUE_LOCAL) -> list[dt.datetime]:
    """Every scheduled issue time from `start` to `end` (inclusive), in UTC."""
    out = []
    day = start
    while day <= end:
        for hm in local:
            h, m = (int(x) for x in hm.split(":"))
            out.append(dt.datetime(day.year, day.month, day.day, h, m, tzinfo=TZ).astimezone(dt.timezone.utc))
        day += dt.timedelta(days=1)
    return out


def pick_init(inits: list[dt.datetime], issued_at: dt.datetime, delay: dt.timedelta = AVAILABLE_AFTER) -> dt.datetime | None:
    """The newest run that had been published by the issue time, or None."""
    usable = [t for t in inits if t + delay <= issued_at]
    return max(usable) if usable else None


def _r(v: float | None, nd: int = 2) -> float | None:
    return None if v is None else round(v, nd)


def hindcast_issue(src: Gfs, init: dt.datetime, issued_at: dt.datetime, cfg: Config, points: dict[str, tuple[float, float]]) -> dict:
    """One retrospective issuance: the outlook from one archived run, plus its inputs."""
    if init + AVAILABLE_AFTER > issued_at:
        raise ValueError(f"run {init:%Y-%m-%d %H}Z was not published by {issued_at:%Y-%m-%d %H:%M}Z")
    days = cfg["days"] + 1
    box = src.box(init, leads_needed(init, days), VARIABLES + AIRPORT_VARIABLES)
    pull = src.pull(points, days, init, box=box)
    forecast, inputs = build_forecast(pull, None, cfg, issued_at, "hindcast", "hindcast", points, retrospective=True)
    leads = lead_hours(box)
    u = point_series(box, "wind_u_10m", AIRPORT["lat"], AIRPORT["lon"])
    v = point_series(box, "wind_v_10m", AIRPORT["lat"], AIRPORT["lon"])
    t = point_series(box, "temperature_2m", AIRPORT["lat"], AIRPORT["lon"])
    keep = [k for k, h in enumerate(leads) if h <= AIRPORT_MAX_LEAD_H]
    return {
        "issued_at": _z(issued_at),
        "issue_local": issued_at.astimezone(TZ).strftime("%H:%M"),
        "run_time": _z(init),
        "source": {"provider": src.name, "model": MODEL, "dataset": PREFIX},
        "rules": {"name": cfg["name"], "version": cfg["version"], "config_sha256": cfg.sha256},
        "days": [
            {
                **day,
                "inputs": {
                    "wind_ms_100m": {k: [_r(x) for x in vals] for k, vals in arch["wind_ms_100m"].items()},
                    "temp_c": [_r(x) for x in arch["temp_c"]],
                    "rh": [_r(x, 1) for x in arch["rh"]],
                },
            }
            for day, arch in zip(forecast["days"], inputs["days"])
        ],
        # native lead times only (no filled-in hours), for the error check against observations
        "airport": {
            "id": AIRPORT["id"],
            "lead_h": [int(leads[k]) for k in keep],
            "wind_ms_10m": [_r(wind_speed(u[k], v[k])) for k in keep],
            "temp_c": [_r(t[k]) for k in keep],
        },
    }


def rescore(day: dict, day_number: int, cfg: Config) -> dict:
    """Re-run the rules on a stored evening, e.g. with new weights (no ensemble: horizon only)."""
    i = day["inputs"]
    inputs = WindowInputs(dt.date.fromisoformat(day["date"]), i["wind_ms_100m"], i["temp_c"], i["rh"], None)
    out = outlook_day(inputs, day_number, cfg)
    out.pop("_detail", None)
    return out


def _z(t: dt.datetime) -> str:
    return t.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")


# ---------- storage: one JSON Lines file per month, sorted by issue time ----------


def month_path(out_dir: Path, issued_at: str) -> Path:
    return out_dir / f"{issued_at[:7]}.jsonl"


def read_records(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def done_issues(out_dir: Path) -> set[str]:
    return {r["issued_at"] for p in sorted(out_dir.glob("*.jsonl")) for r in read_records(p)}


def write_records(out_dir: Path, records: list[dict]) -> None:
    """Merge records into their month files (existing records with the same issue time are
    replaced), sorted, written atomically."""
    by_month: dict[Path, list[dict]] = {}
    for r in records:
        by_month.setdefault(month_path(out_dir, r["issued_at"]), []).append(r)
    for path, new in by_month.items():
        merged = {r["issued_at"]: r for r in read_records(path)}
        merged.update({r["issued_at"]: r for r in new})
        tmp = path.with_suffix(".jsonl.tmp")
        tmp.write_text("".join(json.dumps(merged[k], separators=(",", ":"), ensure_ascii=False) + "\n" for k in sorted(merged)))
        tmp.replace(path)
