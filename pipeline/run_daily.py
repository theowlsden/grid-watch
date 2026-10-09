"""Daily pipeline run (spec 7.6). Scheduled by supercronic in the pipeline container.

Writes to GRIDWATCH_DATA_DIR (a volume shared with the web container):
  data/heartbeat.json   last run time and status, served at /data/heartbeat.json
Phase 2 adds here: fetch weather, compute the stress outlook, write data/forecast.json and
an append-only copy under history/.

Each run logs one line with the inputs hash, version and duration (spec 9, observability).
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from paths import EVENTS_YAML, SITES_SNAPSHOT  # noqa: E402
from validate import Report, check_events, check_sites, read_json  # noqa: E402
from events import load_events_yaml  # noqa: E402

VERSION = "0.1.0"
DATA_DIR = Path(os.environ.get("GRIDWATCH_DATA_DIR", Path(__file__).resolve().parent.parent / "var"))


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


def main() -> int:
    started = time.monotonic()
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    report = Report()
    sites = read_json(SITES_SNAPSHOT, report)
    if sites is not None:
        check_sites(sites, report)
    check_events(load_events_yaml(EVENTS_YAML), report, published=False, where="events.yaml")

    status = "ok" if report.ok else "error"
    heartbeat = {
        "last_run": now.isoformat().replace("+00:00", "Z"),
        "status": status,
        "pipeline_version": VERSION,
        "inputs_hash": inputs_hash([SITES_SNAPSHOT, EVENTS_YAML]),
        "forecast": None,  # Phase 2
    }
    write_atomic(DATA_DIR / "data" / "heartbeat.json", json.dumps(heartbeat, indent=2) + "\n")
    duration = time.monotonic() - started
    print(f"run_daily status={status} version={VERSION} inputs={heartbeat['inputs_hash']} duration={duration:.2f}s errors={len(report.errors)}", flush=True)
    for e in report.errors:
        print(f"ERROR {e}", flush=True)
    return 0 if report.ok else 1


if __name__ == "__main__":
    sys.exit(main())
