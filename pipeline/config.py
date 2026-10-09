"""Loads stress_config.yaml (spec 5.2: weights and thresholds are configuration)."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

CONFIG_PATH = Path(__file__).resolve().parent / "stress_config.yaml"


@dataclass(frozen=True)
class Config:
    raw: dict[str, Any]
    sha256: str  # recorded with every issuance

    def __getitem__(self, key: str) -> Any:
        return self.raw[key]

    @property
    def window_hours(self) -> list[int]:
        start = int(self.raw["window_local"]["start"][:2])
        end = int(self.raw["window_local"]["end"][:2])
        return list(range(start, end))


def load_config(path: Path = CONFIG_PATH) -> Config:
    text = path.read_bytes()
    return Config(yaml.safe_load(text), hashlib.sha256(text).hexdigest())
