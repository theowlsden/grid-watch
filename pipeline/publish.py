"""Writes an issuance (spec 5.4, 7.6): an immutable archive copy, then the public file.

    <data dir>/data/history/YYYY/MM/DD/HHMM-<trigger>.json   never overwritten
    <data dir>/data/forecast.json                            when publishing is on
    <data dir>/data/preview/forecast.json                    when it is off (GRIDWATCH_PUBLISH)
"""

from __future__ import annotations

import datetime as dt
import json
from pathlib import Path


def _atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def archive(data_dir: Path, forecast: dict, inputs: dict, trigger: str) -> Path:
    issued = dt.datetime.fromisoformat(forecast["issued_at"].replace("Z", "+00:00"))
    path = data_dir / "data" / "history" / f"{issued:%Y/%m/%d}" / f"{issued:%H%M}-{trigger}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    # exclusive create: an issuance is written once and never changed (append-only)
    with path.open("x", encoding="utf-8") as fh:
        json.dump({"forecast": forecast, "inputs": inputs}, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    path.chmod(0o444)
    return path


def publish(data_dir: Path, forecast: dict, live: bool) -> Path:
    path = data_dir / "data" / ("forecast.json" if live else "preview/forecast.json")
    _atomic(path, json.dumps(forecast, indent=2, ensure_ascii=False) + "\n")
    return path
