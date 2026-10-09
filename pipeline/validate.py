"""Validate every JSON file the site serves or reads (spec 7.1, 7.4, 11).

Checks each file against its JSON Schema in schemas/ and adds rules a schema cannot express.
Exit code 1 when there are errors. Warnings do not fail the run.

    python pipeline/validate.py

Events: entries in events.yaml may still have TODO sources (a warning; they are not
published). The published events.json must only contain fully sourced events (an error).
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from events import build_events, dumps, load_events_yaml  # noqa: E402
from paths import EVENTS_JSON, EVENTS_YAML, FORECAST_JSON, SCHEMAS, SITES_SNAPSHOT  # noqa: E402

# Level thresholds from spec 5.1; keep in step with web/src/lib/levels.ts.
THRESHOLDS = [(60, "high"), (45, "elevated"), (25, "moderate")]


def level_from_index(index: float) -> str:
    for start, name in THRESHOLDS:
        if index >= start:
            return name
    return "low"


FORMATS = FormatChecker()


@FORMATS.checks("date-time", raises=ValueError)
def _is_datetime(value: object) -> bool:
    if isinstance(value, str):
        parsed = dt.datetime.fromisoformat(value)
        if parsed.tzinfo is None:
            raise ValueError("date-time needs a time zone")
    return True


@FORMATS.checks("date", raises=ValueError)
def _is_date(value: object) -> bool:
    if isinstance(value, str):
        dt.date.fromisoformat(value)
    return True


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def error(self, where: str, msg: str) -> None:
        self.errors.append(f"{where}: {msg}")

    def warn(self, where: str, msg: str) -> None:
        self.warnings.append(f"{where}: {msg}")

    @property
    def ok(self) -> bool:
        return not self.errors


def load_schema(name: str) -> dict[str, Any]:
    return json.loads((SCHEMAS / name).read_text(encoding="utf-8"))


def check_schema(data: Any, schema_name: str, where: str, report: Report) -> bool:
    validator = Draft202012Validator(load_schema(schema_name), format_checker=FORMATS)
    errors = sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path))
    for e in errors:
        path = "/".join(str(p) for p in e.absolute_path) or "(root)"
        report.error(where, f"{path}: {e.message}")
    return not errors


def read_json(path: Path, report: Report) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        report.error(str(path), "file not found")
    except json.JSONDecodeError as exc:
        report.error(str(path), f"invalid JSON: {exc}")
    return None


def _date(value: str) -> dt.date:
    return dt.date.fromisoformat(value[:10])


# ---------- sites snapshot ----------


def check_sites(data: Any, report: Report, where: str = "sites") -> set[str]:
    if not check_schema(data, "sites-snapshot.schema.json", where, report):
        return set()
    slugs: set[str] = set()
    for i, s in enumerate(data["sites"]):
        at = f"{where}: sites/{i} ({s['slug']})"
        if s["slug"] in slugs:
            report.error(at, "duplicate slug")
        slugs.add(s["slug"])
        has_coords = s["lat"] is not None and s["lon"] is not None
        if s["placement"] == "exact" and not has_coords:
            report.error(at, "placement 'exact' needs lat and lon")
        if s["enabled"] and not has_coords and not s.get("placeholder_uv"):
            report.error(at, "enabled site needs lat/lon or a placeholder position")
        if s["enabled"] and not has_coords:
            report.warn(at, "no coordinates yet (placeholder position on the stylised map)")
    outline = data["island"]["outline"]
    if outline:
        ring = outline["coordinates"][0]
        if ring[0] != ring[-1]:
            report.error(f"{where}: island", "outline ring must be closed (first point = last point)")
        n = len(ring) - 1
        if not 150 <= n <= 400:
            report.warn(f"{where}: island", f"outline has {n} vertices (spec 7.4 suggests 150 to 400)")
        for s in data["sites"]:
            if s["enabled"] and s["lat"] is not None and s["lon"] is not None and not point_in_ring(s["lon"], s["lat"], ring):
                report.warn(f"{where}: sites ({s['slug']})", "position lies outside the island outline")
    return {s["slug"] for s in data["sites"] if s["enabled"]}


def point_in_ring(x: float, y: float, ring: list[list[float]]) -> bool:
    """Even-odd ray casting; ring is a closed list of [lon, lat]."""
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


# ---------- forecast ----------


def check_forecast(data: Any, report: Report, known_slugs: set[str], where: str = "forecast") -> None:
    if not check_schema(data, "forecast.schema.json", where, report):
        return
    days = data["days"]
    for i, d in enumerate(days):
        at = f"{where}: days/{i} ({d['date']})"
        expected = level_from_index(d["index"])
        if d["level"] != expected:
            report.error(at, f"level '{d['level']}' does not match index {d['index']} (expected '{expected}')")
        for slug in d["sites"]:
            if known_slugs and slug not in known_slugs:
                report.warn(at, f"status for unknown site '{slug}' will be ignored")
        if i and _date(d["date"]) != _date(days[i - 1]["date"]) + dt.timedelta(days=1):
            report.error(at, "dates must be consecutive days")
    issued = dt.datetime.fromisoformat(data["issued_at"]).astimezone(dt.timezone(dt.timedelta(hours=-4)))
    if _date(days[0]["date"]) < issued.date():
        report.error(where, f"first day {days[0]['date']} is before the local issue date {issued.date()}")
    if len(days) != 7:
        report.warn(where, f"{len(days)} days instead of 7")
    if data["data_mode"] == "live" and not data["sources"]:
        report.error(where, "live forecasts must list their sources")


# ---------- events ----------


def _todo_fields(event: dict[str, Any]) -> list[str]:
    return [f"sources/{i}/{k}" for i, s in enumerate(event["sources"]) for k, v in s.items() if v == "TODO"]


def check_events(data: Any, report: Report, published: bool, where: str = "events") -> None:
    if not check_schema(data, "events.schema.json", where, report):
        return
    seen: set[str] = set()
    for i, e in enumerate(data):
        at = f"{where}: {i} ({e['id']})"
        if e["id"] in seen:
            report.error(at, "duplicate id")
        seen.add(e["id"])
        if e["id"][:10] != e["start_local"][:10]:
            report.error(at, "id must start with the start date")
        if e["end_local"] and _date(e["end_local"]) < _date(e["start_local"]):
            report.error(at, "end_local is before start_local")
        todo = _todo_fields(e)
        if todo and published:
            report.error(at, f"published event without a source ({', '.join(todo)})")
        elif todo:
            report.warn(at, f"not published until its source is filled in ({', '.join(todo)})")
        if published and not e["verified"]:
            report.warn(at, "published but not yet verified against its sources")


def check_events_built(yaml_path: Path, json_path: Path, report: Report) -> None:
    """events.json must be exactly what build_events.py produces from events.yaml."""
    try:
        expected = dumps(build_events(load_events_yaml(yaml_path)))
    except Exception as exc:  # noqa: BLE001 - report any YAML problem as a validation error
        report.error(str(yaml_path), f"cannot read: {exc}")
        return
    actual = json_path.read_text(encoding="utf-8") if json_path.exists() else ""
    if actual != expected:
        report.error(str(json_path), "out of date with events.yaml; run python pipeline/tools/build_events.py")


# ---------- CLI ----------


def run(args: argparse.Namespace) -> Report:
    report = Report()
    sites = read_json(args.sites, report)
    slugs = check_sites(sites, report) if sites is not None else set()

    forecast = read_json(args.forecast, report)
    if forecast is not None:
        check_forecast(forecast, report, slugs)

    events_yaml = load_events_yaml(args.events_yaml) if args.events_yaml.exists() else None
    if events_yaml is None:
        report.error(str(args.events_yaml), "file not found")
    else:
        check_events(events_yaml, report, published=False, where="events.yaml")
        check_events_built(args.events_yaml, args.events, report)
        published = read_json(args.events, report)
        if published is not None:
            check_events(published, report, published=True, where="events.json")
    return report


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--forecast", type=Path, default=FORECAST_JSON)
    p.add_argument("--events", type=Path, default=EVENTS_JSON)
    p.add_argument("--events-yaml", type=Path, default=EVENTS_YAML)
    p.add_argument("--sites", type=Path, default=SITES_SNAPSHOT)
    args = p.parse_args(argv)

    report = run(args)
    for w in report.warnings:
        print(f"warning  {w}")
    for e in report.errors:
        print(f"ERROR    {e}")
    print(f"{len(report.errors)} error(s), {len(report.warnings)} warning(s)")
    return 0 if report.ok else 1


if __name__ == "__main__":
    sys.exit(main())
