"""The weather source interface (decision 18). A source returns hourly forecasts for a set of
named points, local times included, plus who made them and from which model run. The stress
rules only ever see this shape, so providers can be swapped in configuration."""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class PointSeries:
    times: list[dt.datetime]  # timezone-aware, local (America/Curacao)
    wind_ms_100m: list[float | None]
    temp_c: list[float | None]
    rh: list[float | None]


@dataclass
class WeatherPull:
    provider: str
    model: str
    run_time: dt.datetime | None  # model initialisation time (UTC), recorded with every issuance
    retrieved_at: dt.datetime  # UTC
    points: dict[str, PointSeries]  # name -> series
    attribution: dict[str, str]  # {"name": ..., "url": ...}
    request_urls: list[str] = field(default_factory=list)  # without API keys


@dataclass
class EnsemblePull:
    model: str
    run_time: dt.datetime | None
    times: list[dt.datetime]
    members_wind_ms_100m: list[list[float | None]]  # per hour: one value per member


class WeatherSource(Protocol):
    name: str

    def forecast(self, points: dict[str, tuple[float, float]], days: int, model: str) -> WeatherPull: ...

    def ensemble(self, point: tuple[float, float], days: int, model: str) -> EnsemblePull | None: ...
