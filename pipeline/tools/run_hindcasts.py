"""Builds the GFS hindcasts (spec 5.3, decision 20) into data/hindcasts/gfs/: one JSON Lines file
per month plus manifest.json. Resumable: issue times already stored are skipped, so it can be
stopped and started again. About 15 MB is read per issue time.

    python pipeline/tools/run_hindcasts.py --start 2025-01-01            # up to yesterday
    python pipeline/tools/run_hindcasts.py --start 2025-08-20 --end 2025-08-28 --workers 2
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import load_config  # noqa: E402
from hindcast import AIRPORT, AVAILABLE_AFTER, ISSUE_LOCAL, LABEL, done_issues, hindcast_issue, issue_times, pick_init, write_records  # noqa: E402
from outlook import points_for  # noqa: E402
from paths import ROOT, SITES_SNAPSHOT  # noqa: E402
from sources.gfs import ATTRIBUTION, PREFIX, Gfs, _utc  # noqa: E402

OUT = ROOT / "data" / "hindcasts" / "gfs"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--start", type=dt.date.fromisoformat, required=True)
    ap.add_argument("--end", type=dt.date.fromisoformat, default=dt.date.today() - dt.timedelta(days=1))
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)

    cfg = load_config()
    snap = json.loads(SITES_SNAPSHOT.read_text())
    pts = points_for(snap["sites"], (snap["island"]["anchorLat"], snap["island"]["anchorLon"]))
    src = Gfs()
    inits = [_utc(t) for t in src.ds.init_time.values]
    done = done_issues(args.out)
    todo = [t for t in issue_times(args.start, args.end) if t.isoformat().replace("+00:00", "Z") not in done]
    manifest_path = args.out / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"missing": {}}
    print(f"{len(todo)} issue times to do ({len(done)} already stored), {args.workers} workers", flush=True)

    def one(issued_at: dt.datetime) -> dict:
        init = pick_init(inits, issued_at)
        if init is None:
            raise LookupError("no GFS run published by then")
        for attempt in range(2):
            try:
                return hindcast_issue(src, init, issued_at, cfg, pts)
            except (OSError, RuntimeError):  # network trouble: one more try after a pause
                time.sleep(10 * (attempt + 1))
        return hindcast_issue(src, init, issued_at, cfg, pts)

    started = time.time()
    batch: list[dict] = []
    n_ok = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(one, t): t for t in todo}
        for k, fut in enumerate(as_completed(futures), 1):
            key = futures[fut].isoformat().replace("+00:00", "Z")
            try:
                batch.append(fut.result())
                manifest["missing"].pop(key, None)
                n_ok += 1
            except Exception as exc:  # noqa: BLE001 - recorded, the run goes on
                manifest["missing"][key] = f"{type(exc).__name__}: {exc}"[:300]
            if len(batch) >= 20 or k == len(todo):
                write_records(args.out, batch)
                batch = []
                rate = (time.time() - started) / k
                print(f"{k}/{len(todo)} done, {len(manifest['missing'])} missing, about {rate * (len(todo) - k) / 60:.0f} min left", flush=True)

    stored = done_issues(args.out)
    manifest.update(
        {
            "label": LABEL,
            "source": {"name": ATTRIBUTION["name"], "url": ATTRIBUTION["url"], "dataset": PREFIX, "licence": "CC BY 4.0"},
            "issue_times_local": list(ISSUE_LOCAL),
            "available_after_hours": AVAILABLE_AFTER.total_seconds() / 3600,
            "airport": AIRPORT,
            "rules": {"name": cfg["name"], "version": cfg["version"], "config_sha256": cfg.sha256},
            "first": min(stored) if stored else None,
            "last": max(stored) if stored else None,
            "count": len(stored),
            "updated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        }
    )
    manifest["missing"] = dict(sorted(manifest["missing"].items()))
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"stored {n_ok} new, {len(stored)} in total, {len(manifest['missing'])} missing", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
