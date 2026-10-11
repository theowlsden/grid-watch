"""Backtest report (spec 5.3) from the stored hindcasts, the sourced events and the airport METAR.
Writes data/backtests/<rules>-gfs.json and docs/results.md. Computed from stored files only.

    python pipeline/tools/run_backtest.py
    python pipeline/tools/run_backtest.py --coverage-end 2026-10-09
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backtest import METHODS, THRESHOLDS, case_studies, caveat_text, caveats, detection, level_frequency, predictions, short_range_bias, to_events, weather_error  # noqa: E402
from config import load_config  # noqa: E402
from events import has_sources, load_events_yaml  # noqa: E402
from hindcast import read_records  # noqa: E402
from observations import load as load_observations  # noqa: E402
from paths import EVENTS_YAML, ROOT  # noqa: E402

HINDCASTS = ROOT / "data" / "hindcasts" / "gfs"
OBSERVATIONS = ROOT / "data" / "observations" / "tncc"
OUT_DIR = ROOT / "data" / "backtests"
RESULTS_MD = ROOT / "docs" / "results.md"
NAMES = {
    "rules": "Rules (rules-v0)",
    "wind_only": "Wind only (rules without demand)",
    "persistence": "Persistence (event in the last 7 days)",
    "seasonal": "Seasonal average (same month before)",
    "base_rate": "Base rate (share of event evenings so far)",
}


def build(coverage_start: dt.date, coverage_end: dt.date) -> dict:
    cfg = load_config()
    records = [r for p in sorted(HINDCASTS.glob("*.jsonl")) for r in read_records(p)]
    if not records:
        raise SystemExit("no hindcasts in data/hindcasts/gfs; run pipeline/tools/run_hindcasts.py first")
    rows = load_events_yaml(EVENTS_YAML)
    sourced = [e for e in rows if has_sources(e)]
    events = to_events(sourced, int(cfg["window_local"]["start"][:2]))
    preds = predictions(records, events, cfg, coverage_start)
    det = detection(preds, events, coverage_start, coverage_end)
    seasonal = sorted(p.issued_at for p in preds if p.scores["seasonal"] is not None)
    err = weather_error(records, load_observations(OBSERVATIONS))
    manifest = json.loads((HINDCASTS / "manifest.json").read_text()) if (HINDCASTS / "manifest.json").exists() else {}
    return {
        "generated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "label": "Retrospective experiment on archived forecasts (spec 5.3)",
        "rules": {"name": cfg["name"], "version": cfg["version"], "config_sha256": cfg.sha256},
        "hindcasts": {"source": manifest.get("source"), "first": records[0]["issued_at"], "last": records[-1]["issued_at"], "count": len(records), "missing": len(manifest.get("missing", {}))},
        "events": {"sourced": len(sourced), "unsourced_excluded": len(rows) - len(sourced), "coverage": [coverage_start.isoformat(), coverage_end.isoformat()]},
        "caveats": caveats(det["event_evenings"], len(rows) - len(sourced), seasonal[0].date().isoformat() if seasonal else None, short_range_bias(err)),
        "weather_error": err,
        "level_frequency": level_frequency(records),
        "detection": det,
        "case_studies": case_studies(records, events),
        "methods": NAMES,
        "thresholds": THRESHOLDS,
    }


def _f(v, nd: int = 2) -> str:  # noqa: ANN001
    return "–" if v is None else (f"{v:.{nd}f}" if isinstance(v, float) else str(v))


def markdown(rep: dict) -> str:
    h = rep["hindcasts"]
    L = [
        "# Results",
        "",
        f"_{rep['label']}. Generated {rep['generated_at']} by `pipeline/tools/run_backtest.py` from stored files only; do not edit by hand._",
        "",
        f"Rules {rep['rules']['name']} {rep['rules']['version']} on {h['count']} hindcast issue times ({h['first'][:10]} to {h['last'][:10]}, 06:00 and 16:00 Curaçao time) "
        f"from {(h['source'] or {}).get('name', 'NOAA GFS')}. Events: {rep['events']['sourced']} with a public source, scored for evenings {rep['events']['coverage'][0]} to {rep['events']['coverage'][1]}.",
        "",
        "## Read this first",
        "",
        *[f"- {caveat_text(c)}" for c in rep["caveats"]],
        "",
        "## A. Weather forecast error at Hato airport (GFS against METAR TNCC)",
        "",
        "| Horizon (h) | Wind 10 m: n | MAE m/s | RMSE | Bias | Temp 2 m: n | MAE °C | RMSE | Bias |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for w, t in zip(rep["weather_error"]["wind_ms_10m"], rep["weather_error"]["temp_c"]):
        L.append(f"| {w['lead_h_from']}–{w['lead_h_to']} | {w['n']} | {_f(w['mae'])} | {_f(w['rmse'])} | {_f(w['bias'])} | {t['n']} | {_f(t['mae'])} | {_f(t['rmse'])} | {_f(t['bias'])} |")
    L += ["", "Bias is forecast minus observed.", "", "## How often each level would have shown", "", "Same-evening outlook from the 06:00 issue, evenings per month.", "", "| Month | Low | Moderate | Elevated | High |", "|---|---|---|---|---|"]
    for m in rep["level_frequency"]:
        L.append(f"| {m['month']} | {m['low']} | {m['moderate']} | {m['elevated']} | {m['high']} |")
    det = rep["detection"]
    L += ["", "## C. Stress-event detection", "", f"{det['event_evenings']} event evenings out of {det['evenings']} scored evenings."]
    if not det["event_evenings"]:
        L += ["", "No sourced events fall in the scored period yet, so detection cannot be scored. Add public sources to `data/events/events.yaml` and run the report again."]
    else:
        for lead in ("0", "1", "2", "3"):
            d = det["by_lead_days"].get(lead)
            if not d:
                continue
            L += ["", f"### {lead} days ahead ({d['n']} outlooks, {d['event_evenings']} for event evenings)", "", "| Method | Brier | At | Precision | Recall | False-positive rate |", "|---|---|---|---|---|---|"]
            for m in METHODS:
                md = d["methods"][m]
                for t, c in md["thresholds"].items():
                    L.append(f"| {rep['methods'][m]} | {_f(md['brier']['brier'], 3)} | ≥ {t} | {_f(c['precision'])} | {_f(c['recall'])} | {_f(c['fpr'])} |")
        L += ["", "### Calibration of the index (all lead times)", "", "| Index | Outlooks | Event evenings | Observed share |", "|---|---|---|---|"]
        for c in det["calibration"]:
            L.append(f"| {c['index_from']}–{c['index_to']} | {c['n']} | {c['event_evenings']} | {_f(c['observed_rate'])} |")
        L += ["", "### Warning time", "", "| Event | Threshold | First issue at or above | Hours before the start |", "|---|---|---|---|"]
        for w in det["warning_times"]:
            L.append(f"| {w['event']} | {w['threshold']} | {w['first_issue'] or 'never'} | {_f(w['hours_ahead'], 1)} |")
    L += ["", "## Case studies", ""]
    if not rep["case_studies"]:
        L.append("None yet: the case-study events (spec 5.3) need public sources first.")
    for cs in rep["case_studies"]:
        L += [f"### {cs['event']} ({cs['type']}, starts {cs['start_local']})", "", "In a retrospective experiment the rules would have indicated:", "", "| When | Issue used | Index | Level |", "|---|---|---|---|"]
        for r in cs["rows"]:
            L.append(f"| {r['at']} | {r['issued_at'] or '(no hindcast)'} | {_f(r['index'])} | {r['level'] or '–'} |")
        L.append("")
    L += ["", "B. Demand proxy: not scored yet; it needs public monthly demand totals (spec 5.3 B).", ""]
    return "\n".join(L)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--coverage-start", type=dt.date.fromisoformat, default=dt.date(2025, 1, 1), help="first evening the event database is meant to cover")
    ap.add_argument("--coverage-end", type=dt.date.fromisoformat, default=dt.date.today() - dt.timedelta(days=1), help="last evening with known outcomes")
    args = ap.parse_args(argv)
    rep = build(args.coverage_start, args.coverage_end)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{rep['rules']['name']}-gfs.json"
    out.write_text(json.dumps(rep, indent=1, ensure_ascii=False) + "\n")
    RESULTS_MD.write_text(markdown(rep))
    print(f"wrote {out.relative_to(ROOT)} and {RESULTS_MD.relative_to(ROOT)}: {rep['hindcasts']['count']} issue times, {rep['events']['sourced']} sourced events")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
