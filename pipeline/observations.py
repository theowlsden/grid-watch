"""Observed weather at Hato airport (METAR TNCC) for the forecast-error check (spec 5.3 A,
decision 20). From the Iowa Environmental Mesonet ASOS archive (public domain; credit: Iowa
Environmental Mesonet, Iowa State University). Wind is measured at 10 m, not at hub height.
Stored as data/observations/tncc/YYYY.csv, one row per routine report, UTC times."""

from __future__ import annotations

import csv
import datetime as dt
import io
from dataclasses import dataclass
from pathlib import Path

KT_TO_MS = 0.514444
COLUMNS = ["valid_utc", "wind_kt", "wind_ms", "wind_dir_deg", "gust_kt", "temp_c", "rh"]


@dataclass
class Observation:
    valid: dt.datetime  # UTC
    wind_ms: float | None
    temp_c: float | None
    rh: float | None


def _num(s: str) -> float | None:
    s = (s or "").strip()
    if not s or s in ("M", "null"):
        return None
    return float(s)


def parse_iem(text: str) -> list[dict]:
    """IEM's comma-separated ASOS output (station,valid,tmpf,relh,drct,sknt,gust) to stored rows."""
    rows = []
    for r in csv.DictReader(io.StringIO(text)):
        if not r.get("valid"):
            continue
        t = dt.datetime.strptime(r["valid"], "%Y-%m-%d %H:%M").replace(tzinfo=dt.timezone.utc)
        kt, tf = _num(r.get("sknt", "")), _num(r.get("tmpf", ""))
        rows.append(
            {
                "valid_utc": t.strftime("%Y-%m-%dT%H:%MZ"),
                "wind_kt": kt,
                "wind_ms": None if kt is None else round(kt * KT_TO_MS, 2),
                "wind_dir_deg": _num(r.get("drct", "")),
                "gust_kt": _num(r.get("gust", "")),
                "temp_c": None if tf is None else round((tf - 32) * 5 / 9, 1),
                "rh": _num(r.get("relh", "")),
            }
        )
    return rows


def write_year(path: Path, rows: list[dict]) -> None:
    rows = sorted({r["valid_utc"]: r for r in rows}.values(), key=lambda r: r["valid_utc"])
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        for r in rows:
            w.writerow({k: "" if r[k] is None else r[k] for k in COLUMNS})


def load(directory: Path) -> dict[dt.datetime, Observation]:
    """All stored reports, keyed by UTC time; on the hour only (the routine reports)."""
    out = {}
    for path in sorted(directory.glob("*.csv")):
        with path.open() as f:
            for r in csv.DictReader(f):
                t = dt.datetime.strptime(r["valid_utc"], "%Y-%m-%dT%H:%MZ").replace(tzinfo=dt.timezone.utc)
                if t.minute:
                    continue
                out[t] = Observation(t, _num(r["wind_ms"]), _num(r["temp_c"]), _num(r["rh"]))
    return out
