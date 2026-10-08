"""Build /data/events.json from the sourced event database in data/events/events.yaml (spec 7.1, 8.4)."""

from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
from typing import Any

import yaml


def _normalise(value: Any) -> Any:
    # Unquoted dates in YAML load as date objects; the contract stores them as strings.
    if isinstance(value, (dt.date, dt.datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _normalise(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_normalise(v) for v in value]
    return value


def load_events_yaml(path: Path) -> list[dict[str, Any]]:
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    if not isinstance(data, list):
        raise ValueError(f"{path}: expected a list of events")
    return [_normalise(e) for e in data]


def build_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Events in chronological order, newest last, as served to the site."""
    return sorted(events, key=lambda e: (str(e.get("start_local", ""))[:10], str(e.get("id", ""))))


def dumps(data: Any) -> str:
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"
