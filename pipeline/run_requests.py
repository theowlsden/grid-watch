"""Manual runs requested by the Telegram bot (decision 17). supercronic calls this every minute.

The bot drops <control>/run-request.json on the shared control volume; this claims it (atomic
rename), runs the pipeline with --trigger manual (rate-limited in run_daily), and leaves
run-result.<id>.json for the bot to report, plus last-run.json for /status.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import run_daily  # noqa: E402

CONTROL = Path(os.environ.get("GRIDWATCH_CONTROL_DIR", "/var/lib/gridwatch-control"))


def main() -> int:
    req = CONTROL / "run-request.json"
    claimed = CONTROL / "run-request.processing"
    if not req.exists():
        return 0
    try:
        req.replace(claimed)  # only one runner wins
    except FileNotFoundError:
        return 0
    try:
        rid = str(json.loads(claimed.read_text()).get("id", "unknown"))[:32]
    except ValueError:
        rid = "unknown"
    code = run_daily.run("manual")
    hb = run_daily.read_heartbeat()
    result = {
        "id": rid,
        "finished_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "result": {0: "ok", 2: "refused"}.get(code, "error"),
        "status": hb.get("status"),
        "forecast": hb.get("forecast") if code == 0 else hb.get("last_good_forecast"),
    }
    text = json.dumps(result, indent=2) + "\n"
    (CONTROL / f"run-result.{rid}.json").write_text(text)
    (CONTROL / "last-run.json").write_text(text)
    claimed.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
