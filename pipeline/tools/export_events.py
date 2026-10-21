"""Stored copy of the CMS's published events and notices (spec 8.4): writes
data/events/events.yaml and data/events/notices.yaml, so the backtest and the site's fallback
run from files in the repository. Reads the public API only, so drafts are not included.

    python pipeline/tools/export_events.py --cms https://cms.grid.example.org
    python pipeline/tools/build_events.py      # then rebuild web/public/data/events.json
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from paths import EVENTS_YAML, NOTICES_YAML  # noqa: E402
from validate import Report, check_events, check_notices  # noqa: E402

USER_AGENT = "GridWatchCuracao/0.1 (+https://github.com/theowlsden/grid-watch)"
EVENTS_HEADER = """# Reported grid events in Curaçao (spec 8.4). STORED COPY of the CMS events collection, written by
# pipeline/tools/export_events.py; edit events in the CMS, not here. Only published events are in
# this file; drafts (e.g. waiting for a source) stay in the CMS.
#
# - type: blackout | outage | load_shedding | shortage (announcements are notices: notices.yaml)
# - scope: island | areas | unknown; areas: neighbourhood names as in OpenStreetMap
# - cause: supply (not enough generation: what the outlook is about) | network (a local fault) | unknown
# - start_local / end_local: a local date, or a local date-time with the -04:00 offset
#
# Rebuild the site's copy after exporting:  python pipeline/tools/build_events.py
"""
NOTICES_HEADER = """# Notices: announcements by the utility or another official source of what may or will happen
# (spec 8.4). STORED COPY of the CMS notices collection (pipeline/tools/export_events.py); never
# scored as outcomes. Every notice needs its public source.
"""


def fetch_all(cms: str, collection: str) -> list[dict]:
    items, page = [], 1
    while True:
        q = urllib.parse.urlencode({"perPage": 200, "page": page, "sort": "slug"})
        req = urllib.request.Request(f"{cms}/api/collections/{collection}/records?{q}", headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=30) as res:
            body = json.loads(res.read())
        items += body["items"]
        if page >= body.get("totalPages", 1):
            return items
        page += 1


def _source(r: dict) -> dict:
    return {
        "publisher": r.get("source_publisher") or r.get("publisher") or "TODO",
        # for a notice the source is the notice itself, so its own title (or summary) will do
        "title": r.get("source_title") or r.get("title") or (r.get("summary_en") or "")[:140] or "TODO",
        "url": r.get("source_url") or "TODO",
        "published_at": r.get("source_published") or (r.get("published_local") or "")[:10] or "TODO",
        "retrieved_at": r.get("source_retrieved") or (r.get("updated") or "")[:10] or "TODO",
    }


def to_event(r: dict, notice_slugs: dict[str, str]) -> dict:
    e = {"id": r["slug"]}
    if r.get("title"):
        e["title"] = r["title"]
    e |= {
        "start_local": r["start_local"],
        "end_local": r.get("end_local") or None,
        "type": r["type"],
        "severity": r["severity"],
        "scope": r["scope"],
    }
    if r.get("areas"):
        e["areas"] = r["areas"]
    e |= {"cause": r["cause"], "drivers": r.get("drivers") or [], "summary": r["summary_en"], "sources": [_source(r), *(r.get("more_sources") or [])]}
    if r.get("notice") and r["notice"] in notice_slugs:
        e["notice"] = notice_slugs[r["notice"]]
    e["verified"] = bool(r.get("verified"))
    return e


def to_notice(r: dict, event_by_notice: dict[str, str]) -> dict:
    n = {"id": r["slug"]}
    if r.get("title"):
        n["title"] = r["title"]
    n |= {
        "published_local": r["published_local"],
        "publisher": r["publisher"],
        "announced": r["announced"],
        "starts_local": r.get("starts_local") or None,
        "ends_local": r.get("ends_local") or None,
        "scope": r["scope"],
    }
    if r.get("areas"):
        n["areas"] = r["areas"]
    n |= {"summary": r["summary_en"], "sources": [_source(r)]}
    if r["id"] in event_by_notice:
        n["event"] = event_by_notice[r["id"]]
    return n


def write(path: Path, header: str, rows: list[dict]) -> None:
    text = yaml.safe_dump(rows, sort_keys=False, allow_unicode=True, width=100) if rows else "[]\n"
    path.write_text(header + "\n" + text, encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--cms", required=True, help="CMS origin, e.g. https://cms.grid.example.org")
    ap.add_argument("--out-dir", type=Path, default=EVENTS_YAML.parent, help="where events.yaml and notices.yaml go")
    args = ap.parse_args(argv)
    cms = args.cms.rstrip("/")
    raw_notices, raw_events = fetch_all(cms, "notices"), fetch_all(cms, "events")
    notice_slugs = {r["id"]: r["slug"] for r in raw_notices}
    event_by_notice = {r["notice"]: r["slug"] for r in raw_events if r.get("notice")}
    events = sorted((to_event(r, notice_slugs) for r in raw_events), key=lambda e: (e["start_local"][:10], e["id"]))
    notices = sorted((to_notice(r, event_by_notice) for r in raw_notices), key=lambda n: (n["published_local"][:10], n["id"]))
    report = Report()
    check_events(events, report, published=True, where="events (CMS)")
    check_notices(notices, report, where="notices (CMS)")
    for w in report.warnings:
        print(f"warning  {w}")
    for e in report.errors:
        print(f"ERROR    {e}")
    if not report.ok:
        print("the CMS data does not pass validation; nothing written")
        return 1
    args.out_dir.mkdir(parents=True, exist_ok=True)
    write(args.out_dir / EVENTS_YAML.name, EVENTS_HEADER, events)
    write(args.out_dir / NOTICES_YAML.name, NOTICES_HEADER, notices)
    print(f"wrote {len(events)} events and {len(notices)} notices; now run python pipeline/tools/build_events.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
