"""Refresh data/sites.snapshot.json from the CMS (spec 7.4).

The snapshot ships inside the static build as the fallback when the CMS is unreachable, and
the pipeline reads it so a CMS outage never blocks forecasting. Run after editing sites or the
island in the CMS, review the diff, and commit it.

    python pipeline/tools/export_sites.py --cms https://cms.grid.noirvisuals.studio
    python pipeline/tools/export_sites.py --cms ... --check   # exit 1 if the snapshot differs

Uses the public API, so only enabled sites and the active island are exported.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from paths import SITES_SNAPSHOT  # noqa: E402
from validate import Report, check_sites  # noqa: E402

SITE_FIELDS = [
    "slug", "name_en", "name_pap", "kind", "parks", "lat", "lon", "placement", "enabled", "sortOrder",
    "description_en", "description_pap", "pap_reviewed", "source_url", "source_note", "modelOffset",
    "modelRotation", "placeholder_uv",
]
ISLAND_FIELDS = ["version", "outline", "anchorLat", "anchorLon", "metresPerUnit", "rotation"]
# PocketBase returns "" or 0 for empty optional fields; the snapshot uses null.
NULLABLE = {"name_pap", "description_en", "description_pap", "source_url", "source_note", "parks", "modelOffset", "placeholder_uv", "outline"}
NUMBER_OR_NULL = {"lat", "lon", "modelRotation", "anchorLat", "anchorLon", "metresPerUnit"}


def _get(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=15) as res:
        return json.loads(res.read())


def _clean(rec: dict, fields: list[str]) -> dict:
    out = {}
    for f in fields:
        v = rec.get(f)
        if f in NULLABLE and v in ("", None):
            v = None
        if f in NUMBER_OR_NULL and v in (0, "", None):
            v = None
        out[f] = v
    return out


def build_snapshot(cms: str, comment: str | None) -> dict:
    base = cms.rstrip("/")
    sites = _get(f"{base}/api/collections/sites/records?perPage=200&sort=sortOrder")["items"]
    islands = _get(f"{base}/api/collections/island/records?perPage=1&sort=-updated")["items"]
    if not islands:
        raise SystemExit("no active island record in the CMS")
    island = _clean(islands[0], ISLAND_FIELDS)
    island["rotation"] = islands[0].get("rotation") or 0
    snap = {
        "exported_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "island": island,
        "sites": [_clean(s, SITE_FIELDS) for s in sites],
    }
    if comment:
        snap = {"_comment": comment, **snap}
    return snap


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--cms", required=True, help="CMS origin, e.g. https://cms.grid.noirvisuals.studio")
    p.add_argument("--out", type=Path, default=SITES_SNAPSHOT)
    p.add_argument("--check", action="store_true", help="compare with the committed snapshot instead of writing")
    args = p.parse_args(argv)

    current = json.loads(args.out.read_text(encoding="utf-8")) if args.out.exists() else {}
    snap = build_snapshot(args.cms, current.get("_comment"))
    report = Report()
    check_sites(snap, report)
    for e in report.errors:
        print(f"ERROR    {e}")
    if not report.ok:
        print("CMS data does not match the sites schema; snapshot not written")
        return 1

    def comparable(s: dict) -> dict:
        return {k: v for k, v in s.items() if k not in ("exported_at", "_comment")}

    if args.check:
        same = comparable(snap) == comparable(current)
        print("snapshot is up to date" if same else "snapshot differs from the CMS; run without --check and commit the result")
        return 0 if same else 1
    args.out.write_text(json.dumps(snap, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {args.out} ({len(snap['sites'])} sites)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
