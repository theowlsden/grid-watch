"""Rule-based stress outlook rules-v0 (spec 5.2). Pure functions; the weather comes in, the
outlook goes out, and every number used is in stress_config.yaml."""

from __future__ import annotations

import datetime as dt
import statistics
from dataclasses import dataclass

from config import Config
from power_curve import output_fraction


def heat_index_c(temp_c: float, rh: float) -> float:
    """Heat index (feels-like temperature) with the US National Weather Service formula."""
    t = temp_c * 9 / 5 + 32
    simple = 0.5 * (t + 61.0 + (t - 68.0) * 1.2 + rh * 0.094)
    if (simple + t) / 2 < 80:
        hi = simple
    else:
        hi = (
            -42.379 + 2.04901523 * t + 10.14333127 * rh - 0.22475541 * t * rh - 0.00683783 * t * t
            - 0.05481717 * rh * rh + 0.00122874 * t * t * rh + 0.00085282 * t * rh * rh - 0.00000199 * t * t * rh * rh
        )
        if rh < 13 and 80 <= t <= 112:
            hi -= ((13 - rh) / 4) * ((17 - abs(t - 95)) / 17) ** 0.5
        elif rh > 85 and 80 <= t <= 87:
            hi += ((rh - 85) / 10) * ((87 - t) / 5)
    return (hi - 32) * 5 / 9


def demand_proxy(hi_c: float, cfg: Config) -> float:
    d = cfg["demand"]
    return min(1.0, max(0.0, (hi_c - d["heat_index_low_c"]) / (d["heat_index_high_c"] - d["heat_index_low_c"])))


def demand_word(proxy: float, cfg: Config) -> str:
    d = cfg["demand"]
    return "high" if proxy >= d["high_from"] else "raised" if proxy >= d["raised_from"] else "normal"


def level(index: float, cfg: Config) -> str:
    lv = cfg["levels"]
    return "high" if index >= lv["high"] else "elevated" if index >= lv["elevated"] else "moderate" if index >= lv["moderate"] else "low"


def site_status(wind_ms: float, cfg: Config) -> str:
    s = cfg["site_status"]
    return "high" if wind_ms < s["high_below"] else "elevated" if wind_ms < s["elevated_below"] else "low"


def confidence(day_number: int, spread_ms: float | None, cfg: Config) -> str:
    c = cfg["confidence"]
    steps = ["high", "medium", "low"]
    i = 0 if day_number <= c["high_until_day"] else 1 if day_number <= c["medium_until_day"] else 2
    if spread_ms is not None and spread_ms > c["spread_downgrade_ms"]:
        i = min(2, i + 1)
    return steps[i]


@dataclass
class WindowInputs:
    """Hourly values for one evening window: wind per wind site, heat at the demand point."""

    date: dt.date
    wind_ms: dict[str, list[float]]  # slug -> hourly hub-height wind in the window
    temp_c: list[float]
    rh: list[float]
    ensemble_wind_ms: list[list[float]] | None  # per hour: all members' hub-height wind


def outlook_day(inputs: WindowInputs, day_number: int, cfg: Config) -> dict:
    pc = cfg["power_curve"]
    curve = lambda w: output_fraction(w, pc["cut_in_ms"], pc["rated_ms"], pc["cut_out_ms"])  # noqa: E731
    hourly_wind = [w for series in inputs.wind_ms.values() for w in series]
    wind_mean = statistics.fmean(hourly_wind)
    # mean of the curve over sites and hours (not the curve of the mean: the curve is not linear)
    output = statistics.fmean(curve(w) for w in hourly_wind)
    hi = max(heat_index_c(t, h) for t, h in zip(inputs.temp_c, inputs.rh))
    proxy = demand_proxy(hi, cfg)
    w = cfg["weights"]
    wind_stress = max(0.0, 1 - output / cfg["wind_stress"]["no_stress_at_output"])
    index = round(100 * (w["wind"] * wind_stress + w["demand"] * proxy))
    spread = None
    if inputs.ensemble_wind_ms:
        iqrs = []
        for members in inputs.ensemble_wind_ms:
            q = statistics.quantiles(members, n=4)
            iqrs.append(q[2] - q[0])
        spread = statistics.fmean(iqrs)
    status = site_status(wind_mean, cfg)
    out_pct = round(output * 100)
    return {
        "date": inputs.date.isoformat(),
        "index": index,
        "level": level(index, cfg),
        "confidence": confidence(day_number, spread, cfg),
        "drivers": {
            "wind_ms_100m": round(wind_mean, 1),
            "wind_output_pct_est": out_pct,
            "temp_c": round(max(inputs.temp_c), 1),
            "demand": demand_word(proxy, cfg),
            "capacity": "unknown",
        },
        # spec 12.6: wind is island-wide, so all wind sites share the status and output
        "sites": {slug: {"status": status, "est_output_pct": out_pct} for slug in inputs.wind_ms},
        "_detail": {  # kept in the archived inputs, removed from the public file
            "heat_index_c": round(hi, 1),
            "demand_proxy": round(proxy, 3),
            "wind_output_frac": round(output, 4),
            "wind_stress": round(wind_stress, 4),
            "ensemble_iqr_ms": None if spread is None else round(spread, 2),
        },
    }
