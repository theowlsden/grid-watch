"""Pipeline run (spec 5.2, 7.6, decision 17): fetch weather, build the stress outlook, archive
it, publish it, write the heartbeat. Scheduled twice a day by supercronic; a manual run (later
from the Telegram bot) passes --trigger manual and is rate-limited.

Environment:
  GRIDWATCH_DATA_DIR   shared volume (served under /data by the web container)
  GRIDWATCH_PUBLISH    1/true to publish data/forecast.json; otherwise the result goes to
                       data/preview/forecast.json and the site keeps its current data
  OPEN_METEO_API_KEY   only for Open-Meteo's paid plan

Each run logs one line with the inputs hash, versions and duration (spec 9).
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import load_config  # noqa: E402
from events import load_events_yaml  # noqa: E402
from outlook import build_forecast, points_for  # noqa: E402
from paths import EVENTS_YAML, SITES_SNAPSHOT  # noqa: E402
from publish import archive, publish  # noqa: E402
from sources import get_source  # noqa: E402
from validate import Report, check_events, check_forecast, check_sites, read_json  # noqa: E402

VERSION = "0.2.0"
DATA_DIR = Path(os.environ.get("GRIDWATCH_DATA_DIR", Path(__file__).resolve().parent.parent / "var"))
MANUAL_MIN_INTERVAL = dt.timedelta(minutes=30)


def inputs_hash(paths: list[Path]) -> str:
    h = hashlib.sha256()
    for p in paths:
        h.update(p.read_bytes())
    return h.hexdigest()[:16]


def write_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def read_heartbeat() -> dict:
    try:
        return json.loads((DATA_DIR / "data" / "heartbeat.json").read_text())
    except (OSError, ValueError):
        return {}


def publishing() -> bool:
    return os.environ.get("GRIDWATCH_PUBLISH", "").lower() in ("1", "true", "yes")


def run(trigger: str, source=None, now: dt.datetime | None = None) -> int:  # noqa: ANN001
    started = time.monotonic()
    now = (now or dt.datetime.now(dt.timezone.utc)).replace(microsecond=0)
    previous = read_heartbeat()

    if trigger == "manual" and previous.get("last_manual_run"):
        last = dt.datetime.fromisoformat(previous["last_manual_run"].replace("Z", "+00:00"))
        if now - last < MANUAL_MIN_INTERVAL:
            print(f"run_daily refused: last manual run {previous['last_manual_run']}, wait {MANUAL_MIN_INTERVAL}", flush=True)
            return 2

    cfg = load_config()
    report = Report()
    snap = read_json(SITES_SNAPSHOT, report)
    if snap is not None:
        check_sites(snap, report)
    check_events(load_events_yaml(EVENTS_YAML), report, published=False, where="events.yaml")

    forecast_info = None
    if report.ok:
        try:
            src = source or get_source(cfg["source"]["provider"])
            isl = snap["island"]
            pts = points_for(snap["sites"], (isl["anchorLat"], isl["anchorLon"]))
            pull = src.forecast(pts, cfg["days"] + 1, cfg["source"]["model"])
            wind_sites = [p for n, p in pts.items() if n != "demand"]
            centre = (sum(p[0] for p in wind_sites) / len(wind_sites), sum(p[1] for p in wind_sites) / len(wind_sites))
            ens = src.ensemble(centre, cfg["days"] + 1, cfg["source"]["ensemble_model"])
            issued_at = max(now, pull.retrieved_at)
            forecast, inputs = build_forecast(pull, ens, cfg, issued_at, trigger, VERSION, pts)
            slugs = {s["slug"] for s in snap["sites"] if s["enabled"]}
            check_forecast(forecast, report, slugs, where="new forecast")
            if report.ok:
                arch = archive(DATA_DIR, forecast, inputs, trigger)
                live = publishing()
                pub = publish(DATA_DIR, forecast, live)
                forecast_info = {
                    "issued_at": forecast["issued_at"],
                    "model_run": inputs["weather"]["run_time"],
                    "published": live,
                    "file": str(pub.relative_to(DATA_DIR)),
                    "archive": str(arch.relative_to(DATA_DIR)),
                    "days": len(forecast["days"]),
                }
        except Exception as exc:  # noqa: BLE001 - any failure: keep the last good data, report it
            report.error("run", f"{type(exc).__name__}: {exc}")

    status = "ok" if report.ok else "error"
    heartbeat = {
        "last_run": now.isoformat().replace("+00:00", "Z"),
        "status": status,
        "trigger": trigger,
        "pipeline_version": VERSION,
        "inputs_hash": inputs_hash([SITES_SNAPSHOT, EVENTS_YAML]),
        "forecast": forecast_info,
        # the last good forecast stays listed when a run fails
        "last_good_forecast": forecast_info or previous.get("last_good_forecast") or previous.get("forecast"),
        "last_manual_run": now.isoformat().replace("+00:00", "Z") if trigger == "manual" else previous.get("last_manual_run"),
    }
    write_atomic(DATA_DIR / "data" / "heartbeat.json", json.dumps(heartbeat, indent=2) + "\n")
    duration = time.monotonic() - started
    print(
        f"run_daily status={status} trigger={trigger} version={VERSION} model={cfg['name']}-{cfg['version']} "
        f"inputs={heartbeat['inputs_hash']} published={bool(forecast_info and forecast_info['published'])} duration={duration:.2f}s errors={len(report.errors)}",
        flush=True,
    )
    for e in report.errors:
        print(f"ERROR {e}", flush=True)
    return 0 if report.ok else 1


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--trigger", choices=["scheduled", "manual"], default="scheduled")
    p.add_argument("--skip-if-fresh", type=float, metavar="HOURS", help="do nothing if the last good forecast is younger than this (container start)")
    args = p.parse_args(argv)
    if args.skip_if_fresh is not None:
        last = (read_heartbeat().get("last_good_forecast") or {}).get("issued_at")
        if last:
            age = dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(last.replace("Z", "+00:00"))
            if age < dt.timedelta(hours=args.skip_if_fresh):
                print(f"run_daily skipped: last forecast {last} is {age} old", flush=True)
                return 0
    return run(args.trigger)


if __name__ == "__main__":
    sys.exit(main())
