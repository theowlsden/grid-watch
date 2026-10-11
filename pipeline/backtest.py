"""Backtest of the stress rules on the GFS hindcasts (spec 5.3). Retrospective: every number here
describes what the rules would have indicated, never what was forecast at the time.

Three separate questions (5.3):
  A. Weather forecast error: GFS 10 m wind and 2 m temperature against the Hato airport METAR,
     by forecast horizon (MAE, RMSE, bias). 10 m, not hub height: hub height is not measured.
  B. Demand proxy: needs public demand totals; not scored yet.
  C. Stress-event detection: the rules' index for each evening against the sourced events, by
     lead time, beside baselines. Precision, recall and false-positive rate at index thresholds
     30 to 80, warning time, Brier score and a calibration table, all with a small-sample warning.

No leakage: the rules see only the archived run published by the issue time; the baselines see
only events that started before the issue time. Outcomes count only for evenings up to the
event database's coverage end."""

from __future__ import annotations

import datetime as dt
import math
import statistics
from dataclasses import dataclass, replace
from zoneinfo import ZoneInfo

from config import Config
from hindcast import rescore
from observations import Observation

TZ = ZoneInfo("America/Curacao")
THRESHOLDS = [30, 40, 50, 60, 70, 80]
LEAD_BINS_H = [(0, 6), (6, 12), (12, 24), (24, 48), (48, 72), (72, 96), (96, 120), (120, 144), (144, 169)]
CASE_OFFSETS = [("T-7 d", 168), ("T-72 h", 72), ("T-24 h", 24), ("T-6 h", 6), ("T-1 h", 1)]
PERSISTENCE_DAYS = 7
SMALL_SAMPLE = 30  # fewer event evenings than this: every rate is shown with a warning
METHODS = ["rules", "wind_only", "persistence", "seasonal", "base_rate"]


# ---------- events ----------


@dataclass(frozen=True)
class Event:
    id: str
    start: dt.datetime  # local; a date-only event starts at the evening window (19:00)
    dates: tuple[dt.date, ...]  # local calendar dates it covers
    type: str
    severity: str


def to_events(rows: list[dict], window_start_h: int = 19) -> list[Event]:
    out = []
    for e in rows:
        s = str(e["start_local"])
        if len(s) == 10:
            d0 = dt.date.fromisoformat(s)
            start = dt.datetime(d0.year, d0.month, d0.day, window_start_h, tzinfo=TZ)
        else:
            start = dt.datetime.fromisoformat(s).astimezone(TZ)
            d0 = start.date()
        end = e.get("end_local")
        d1 = dt.date.fromisoformat(str(end)[:10]) if end else d0
        dates = tuple(d0 + dt.timedelta(days=k) for k in range((d1 - d0).days + 1))
        out.append(Event(str(e["id"]), start, dates, str(e.get("type", "")), str(e.get("severity", ""))))
    return sorted(out, key=lambda ev: ev.start)


# ---------- predictions: one per (issue time, evening) ----------


@dataclass
class Prediction:
    issued_at: dt.datetime  # UTC
    date: dt.date  # the evening, local
    lead_days: int  # 0 = the same evening as the issue date
    scores: dict[str, float | None]  # method -> 0..100 (None: method has no value yet)
    level: str


def _parse_z(s: str) -> dt.datetime:
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))


def wind_only_cfg(cfg: Config) -> Config:
    """The rules with the demand proxy switched off: the weather-only baseline (wind alone)."""
    raw = {**cfg.raw, "weights": {"wind": 1.0, "demand": 0.0}}
    return replace(cfg, raw=raw, sha256=cfg.sha256 + "+wind-only")


def predictions(records: list[dict], events: list[Event], cfg: Config, coverage_start: dt.date) -> list[Prediction]:
    wcfg = wind_only_cfg(cfg)
    out = []
    for r in records:
        issued = _parse_z(r["issued_at"])
        issue_date = issued.astimezone(TZ).date()
        # the baselines only know events that had started before the issue time
        known = [e for e in events if e.start.astimezone(dt.timezone.utc) < issued]
        recent = any(e.start.astimezone(dt.timezone.utc) >= issued - dt.timedelta(days=PERSISTENCE_DAYS) for e in known)
        event_dates = {d for e in known for d in e.dates if d < issue_date}
        history = [coverage_start + dt.timedelta(days=k) for k in range((issue_date - coverage_start).days)]
        base = 100 * sum(d in event_dates for d in history) / len(history) if history else None
        for n, day in enumerate(r["days"]):
            date = dt.date.fromisoformat(day["date"])
            # seasonal: the same calendar month in earlier years only, at least one full month
            same_month = [d for d in history if d.month == date.month and d.year < date.year]
            seasonal = 100 * sum(d in event_dates for d in same_month) / len(same_month) if len(same_month) >= 28 else None
            out.append(
                Prediction(
                    issued_at=issued,
                    date=date,
                    lead_days=(date - issue_date).days,
                    scores={
                        "rules": float(day["index"]),
                        "wind_only": float(rescore(day, n, wcfg)["index"]),
                        "persistence": 100.0 if recent else 0.0,
                        "seasonal": seasonal,
                        "base_rate": base,
                    },
                    level=day["level"],
                )
            )
    return out


# ---------- scores ----------


def _rate(a: int, b: int) -> float | None:
    return round(a / b, 3) if b else None


def confusion(preds: list[Prediction], outcome: dict[dt.date, bool], method: str, threshold: float) -> dict:
    tp = fp = fn = tn = 0
    for p in preds:
        s = p.scores[method]
        if s is None or p.date not in outcome:
            continue
        hit, event = s >= threshold, outcome[p.date]
        tp += hit and event
        fp += hit and not event
        fn += event and not hit
        tn += not hit and not event
    return {"tp": tp, "fp": fp, "fn": fn, "tn": tn, "precision": _rate(tp, tp + fp), "recall": _rate(tp, tp + fn), "fpr": _rate(fp, fp + tn)}


def brier(preds: list[Prediction], outcome: dict[dt.date, bool], method: str) -> dict:
    """Score / 100 read as a probability. The rules' index is NOT calibrated to be one (5.1);
    this measures how far off it is, beside the base rate and the seasonal average."""
    pairs = [(p.scores[method] / 100, outcome[p.date]) for p in preds if p.scores[method] is not None and p.date in outcome]
    if not pairs:
        return {"n": 0, "brier": None}
    return {"n": len(pairs), "brier": round(statistics.fmean((q - y) ** 2 for q, y in pairs), 4)}


def calibration(preds: list[Prediction], outcome: dict[dt.date, bool], width: int = 10) -> list[dict]:
    rows = []
    for lo in range(0, 100, width):
        hi = lo + width
        sel = [outcome[p.date] for p in preds if p.date in outcome and lo <= p.scores["rules"] < (hi if hi < 100 else 101)]
        rows.append({"index_from": lo, "index_to": hi, "n": len(sel), "event_evenings": sum(sel), "observed_rate": _rate(sum(sel), len(sel))})
    return rows


def warning_times(preds: list[Prediction], events: list[Event], threshold: float) -> list[dict]:
    """Per event: the earliest issue time whose outlook for one of its evenings reached the
    threshold, and how many hours before the event's start that was."""
    out = []
    for e in events:
        hits = [p.issued_at for p in preds if p.date in e.dates and p.scores["rules"] >= threshold and p.issued_at <= e.start]
        first = min(hits) if hits else None
        out.append({"event": e.id, "threshold": threshold, "first_issue": _z(first), "hours_ahead": round((e.start - first).total_seconds() / 3600, 1) if first else None})
    return out


def detection(preds: list[Prediction], events: list[Event], coverage_start: dt.date, coverage_end: dt.date) -> dict:
    event_dates = {d for e in events for d in e.dates}
    days = (coverage_end - coverage_start).days + 1
    outcome = {coverage_start + dt.timedelta(days=k): (coverage_start + dt.timedelta(days=k)) in event_dates for k in range(days)}
    by_lead = {}
    for lead in sorted({p.lead_days for p in preds}):
        sel = [p for p in preds if p.lead_days == lead and p.date in outcome]
        by_lead[str(lead)] = {
            "n": len(sel),
            "event_evenings": sum(outcome[p.date] for p in sel),
            "methods": {
                m: {"brier": brier(sel, outcome, m), "thresholds": {str(t): confusion(sel, outcome, m, t) for t in THRESHOLDS} if m in ("rules", "wind_only") else {"50": confusion(sel, outcome, m, 50)}}
                for m in METHODS
            },
        }
    scored = [p for p in preds if p.date in outcome]
    used = [e for e in events if any(d in outcome for d in e.dates)]
    return {
        "event_evenings": sum(outcome.values()),
        "evenings": len(outcome),
        "by_lead_days": by_lead,
        "calibration": calibration(scored, outcome),
        "warning_times": [w for t in (45, 60) for w in warning_times(scored, used, t)],
    }


def level_frequency(records: list[dict]) -> list[dict]:
    """How often each level would have shown for the same evening (the 06:00 issue), by month.
    Needs no events: it shows how often the site would have raised a level at all."""
    months: dict[str, dict[str, int]] = {}
    for r in records:
        if r["issue_local"] != "06:00" or not r["days"]:
            continue
        d = r["days"][0]
        if d["date"] != _parse_z(r["issued_at"]).astimezone(TZ).date().isoformat():
            continue
        m = months.setdefault(d["date"][:7], {"low": 0, "moderate": 0, "elevated": 0, "high": 0})
        m[d["level"]] += 1
    return [{"month": k, **v} for k, v in sorted(months.items())]


def weather_error(records: list[dict], obs: dict[dt.datetime, Observation]) -> dict:
    """Part A: GFS at Hato airport against the METAR, by forecast horizon."""
    bins: dict[str, dict[tuple[int, int], list[float]]] = {"wind_ms_10m": {b: [] for b in LEAD_BINS_H}, "temp_c": {b: [] for b in LEAD_BINS_H}}
    for r in records:
        run = _parse_z(r["run_time"])
        a = r["airport"]
        for lead, w, t in zip(a["lead_h"], a["wind_ms_10m"], a["temp_c"]):
            o = obs.get(run + dt.timedelta(hours=lead))
            if o is None:
                continue
            b = next((b for b in LEAD_BINS_H if b[0] <= lead < b[1]), None)
            if b is None:
                continue
            if w is not None and o.wind_ms is not None:
                bins["wind_ms_10m"][b].append(w - o.wind_ms)
            if t is not None and o.temp_c is not None:
                bins["temp_c"][b].append(t - o.temp_c)

    def stats(errs: list[float]) -> dict:
        if not errs:
            return {"n": 0, "mae": None, "rmse": None, "bias": None}
        return {"n": len(errs), "mae": round(statistics.fmean(abs(e) for e in errs), 2), "rmse": round(math.sqrt(statistics.fmean(e * e for e in errs)), 2), "bias": round(statistics.fmean(errs), 2)}

    return {var: [{"lead_h_from": b[0], "lead_h_to": min(b[1], 168), **stats(v)} for b, v in d.items()] for var, d in bins.items()}


def case_studies(records: list[dict], events: list[Event]) -> list[dict]:
    """5.3: what the rules would have indicated for each event at T-7 d ... T-1 h."""
    issued = sorted((_parse_z(r["issued_at"]), r) for r in records)
    out = []
    for e in events:
        rows = []
        for label, hours in CASE_OFFSETS:
            cutoff = e.start - dt.timedelta(hours=hours)
            before = [r for t, r in issued if t <= cutoff]
            row = {"at": label, "cutoff": _z(cutoff), "issued_at": None, "index": None, "level": None}
            if before:
                r = before[-1]
                day = next((d for d in r["days"] if dt.date.fromisoformat(d["date"]) in e.dates), None)
                row.update(issued_at=r["issued_at"])
                if day:
                    row.update(index=day["index"], level=day["level"])
            rows.append(row)
        out.append({"event": e.id, "start_local": e.start.isoformat(), "type": e.type, "rows": rows})
    return out


def _z(t: dt.datetime | None) -> str | None:
    return None if t is None else t.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def short_range_bias(err: dict) -> dict[str, float | None]:
    """Bias in the first six hours: a large one there comes from the place, not the forecast."""
    return {var: rows[0]["bias"] for var, rows in err.items()}


def caveats(n_event_evenings: int, n_unsourced: int, seasonal_from: str | None, bias0: dict[str, float | None] | None = None) -> list[dict]:
    """The report's warnings as codes with their numbers, so the site can show them in every
    language (web/src/i18n: results.caveat.*); CAVEAT_TEXT holds the English for the Markdown."""
    notes: list[dict] = [{"id": "retrospective"}]
    if n_event_evenings < SMALL_SAMPLE:
        notes.append({"id": "small_sample", "n": n_event_evenings})
    notes += [{"id": "not_probability"}, {"id": "evening_window"}, {"id": "capacity_blind"}, {"id": "airport_height"}]
    if n_unsourced:
        notes.append({"id": "unsourced", "n": n_unsourced})
    if bias0 and all(bias0.get(k) is not None for k in ("wind_ms_10m", "temp_c")) and any(abs(b) >= 1 for b in bias0.values() if b is not None):
        notes.append({"id": "place_bias", "wind": round(bias0["wind_ms_10m"], 1), "temp": round(bias0["temp_c"], 1)})
    if seasonal_from:
        notes.append({"id": "seasonal_from", "date": seasonal_from})
    return notes


# English wording of the caveats; keep in step with results.caveat.* in web/src/i18n/en.json
CAVEAT_TEXT = {
    "retrospective": "Retrospective experiment: computed now from archived GFS runs, not outlooks issued at the time.",
    "small_sample": "Very small sample: {n} event evening{s}. Every rate here can change a lot with one more event.",
    "not_probability": "The index is not a probability; Brier scores read it as one only to show how far off that would be.",
    "evening_window": "The evening window is 19:00 to 22:00: events outside it (such as the 02:30 blackout of 27 August 2025) are not what the rules look at.",
    "capacity_blind": "Weather cannot see generator outages or maintenance, the cause of several recent events.",
    "airport_height": "Forecast error is measured at 10 m at Hato airport; the rules use 100 m wind at the parks, which is not measured publicly.",
    "unsourced": "{n} known events are left out until they have a public source.",
    "place_bias": (
        "GFS differs from the airport already in the first hours (10 m wind {wind:+.1f} m/s, temperature {temp:+.1f} °C): "
        "its 0.25° grid cells around Hato are mostly sea, the station is on land. That is a difference of place, not forecast skill; "
        "read the change of error with the horizon, not its level. A cooler GFS also means a lower heat index for the demand proxy."
    ),
    "seasonal_from": "The seasonal-average baseline only has a value from {date}, once a full earlier month of the same name is in the data.",
}


def caveat_text(c: dict) -> str:
    params = {k: v for k, v in c.items() if k != "id"}
    if "n" in params:
        params["s"] = "" if params["n"] == 1 else "s"
    return CAVEAT_TEXT[c["id"]].format(**params)
