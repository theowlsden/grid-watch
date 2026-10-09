"""Container health: healthy when the last daily run succeeded less than 36 hours ago (spec 7.2, 7.6)."""

import datetime as dt
import json
import os
import sys
from pathlib import Path

MAX_AGE = dt.timedelta(hours=36)
path = Path(os.environ.get("GRIDWATCH_DATA_DIR", "/var/lib/gridwatch")) / "data" / "heartbeat.json"

try:
    hb = json.loads(path.read_text())
    age = dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(hb["last_run"])
except (OSError, ValueError, KeyError) as exc:
    print(f"unhealthy: {exc}")
    sys.exit(1)
if hb.get("status") != "ok" or age > MAX_AGE:
    print(f"unhealthy: status={hb.get('status')} age={age}")
    sys.exit(1)
print(f"healthy: last run {hb['last_run']}")
