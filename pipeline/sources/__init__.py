"""Weather sources, chosen by `source.provider` in stress_config.yaml (decision 18)."""

from __future__ import annotations

from .base import EnsemblePull, PointSeries, WeatherPull, WeatherSource
from .gfs import Gfs
from .open_meteo import OpenMeteo

PROVIDERS = {"open-meteo": OpenMeteo, "noaa-gfs": Gfs}


def get_source(provider: str) -> WeatherSource:
    try:
        return PROVIDERS[provider]()
    except KeyError:
        raise SystemExit(f"unknown weather provider {provider!r}; known: {', '.join(PROVIDERS)}") from None


__all__ = ["EnsemblePull", "PointSeries", "WeatherPull", "WeatherSource", "get_source", "PROVIDERS"]
