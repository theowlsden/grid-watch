"""Compare two weather sources through the same rules (decision 18): for each evening, the
island-wide hub-height wind, the evening heat at the demand point, and the resulting index and
level. A quick sanity check before switching `source.provider` in stress_config.yaml.

    python pipeline/tools/compare_sources.py                 # open-meteo against noaa-gfs
    python pipeline/tools/compare_sources.py --json out.json  # also write the numbers

Uses the live APIs; nothing is published or archived."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import load_config  # noqa: E402
from outlook import build_forecast, points_for  # noqa: E402
from paths import SITES_SNAPSHOT  # noqa: E402
from sources import get_source  # noqa: E402


def run(provider: str, cfg, pts, now: dt.datetime) -> dict:  # noqa: ANN001
    src = get_source(provider)
    pull = src.forecast(pts, cfg["days"] + 1, cfg["source"]["model"])
    issued = max(now, pull.retrieved_at)
    forecast, inputs = build_forecast(pull, None, cfg, issued, "compare", "compare", pts)
    return {
        "provider": provider,
        "run_time": inputs["weather"]["run_time"],
        "days": {
            d["date"]: {"wind_ms": d["drivers"]["wind_ms_100m"], "temp_c": d["drivers"]["temp_c"], "index": d["index"], "level": d["level"]}
            for d in forecast["days"]
        },
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--a", default="open-meteo")
    ap.add_argument("--b", default="noaa-gfs")
    ap.add_argument("--json", type=Path)
    args = ap.parse_args(argv)
    cfg = load_config()
    snap = json.loads(SITES_SNAPSHOT.read_text())
    pts = points_for(snap["sites"], (snap["island"]["anchorLat"], snap["island"]["anchorLon"]))
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    # both without an ensemble, so confidence is compared on the same footing
    a, b = run(args.a, cfg, pts, now), run(args.b, cfg, pts, now)
    print(f"{'evening':<11} {args.a + ' (' + str(a['run_time']) + ')':>38}   {args.b + ' (' + str(b['run_time']) + ')':>38}")
    print(f"{'':<11} {'wind m/s  temp C  index level':>38}   {'wind m/s  temp C  index level':>38}")
    for date in sorted(set(a["days"]) | set(b["days"])):
        cells = []
        for r in (a, b):
            d = r["days"].get(date)
            cells.append(f"{d['wind_ms']:>8.1f} {d['temp_c']:>7.1f} {d['index']:>6} {d['level']:<9}" if d else f"{'(no data)':>38}")
        print(f"{date:<11} {cells[0]:>38}   {cells[1]:>38}")
    if args.json:
        args.json.write_text(json.dumps({"compared_at": now.isoformat(), "a": a, "b": b}, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
