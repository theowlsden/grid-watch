"""Open-Meteo source (spec 6, decision 18). Free API for non-commercial use, CC BY 4.0: credit
"Weather data by Open-Meteo.com". Called from the pipeline only, a few times a day. With
OPEN_METEO_API_KEY set it uses the paid customer API instead."""

from __future__ import annotations

import datetime as dt
import json
import os
import time
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

from .base import EnsemblePull, PointSeries, WeatherPull

TZ = "America/Curacao"
USER_AGENT = "GridWatchCuracao/0.1 (+https://github.com/theowlsden/grid-watch)"
ATTRIBUTION = {"name": "Open-Meteo.com", "url": "https://open-meteo.com/"}


class OpenMeteo:
    name = "open-meteo"

    def __init__(self, api_key: str | None = None, timeout: float = 30.0):
        self.api_key = api_key if api_key is not None else os.environ.get("OPEN_METEO_API_KEY") or None
        self.timeout = timeout

    # ---------- HTTP ----------

    def _host(self, free: str) -> str:
        return f"https://customer-{free}" if self.api_key else f"https://{free}"

    def _get(self, url: str, params: dict) -> object:
        query = dict(params)
        if self.api_key:
            query["apikey"] = self.api_key
        full = f"{url}?{urllib.parse.urlencode(query)}"
        last: Exception | None = None
        for attempt in range(3):
            try:
                req = urllib.request.Request(full, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(req, timeout=self.timeout) as res:
                    return json.loads(res.read())
            except Exception as exc:  # noqa: BLE001 - network errors and HTTP errors alike
                last = exc
                time.sleep(5 * (attempt + 1))
        raise RuntimeError(f"Open-Meteo request failed: {last}")

    def run_time(self, model: str) -> dt.datetime | None:
        """Initialisation time of the latest model run, from Open-Meteo's model metadata."""
        try:
            meta = self._get(f"{self._host('api.open-meteo.com')}/data/{model}/static/meta.json", {})
            t = meta.get("last_run_initialisation_time")  # type: ignore[union-attr]
            return dt.datetime.fromtimestamp(t, dt.timezone.utc) if t else None
        except RuntimeError:
            return None

    # ---------- parsing (pure, unit-tested) ----------

    @staticmethod
    def parse_points(data: object, names: list[str]) -> dict[str, PointSeries]:
        items = data if isinstance(data, list) else [data]
        if len(items) != len(names):
            raise ValueError(f"expected {len(names)} locations, got {len(items)}")
        tz = ZoneInfo(TZ)
        out = {}
        for name, item in zip(names, items):
            h = item["hourly"]  # type: ignore[index]
            if item.get("hourly_units", {}).get("wind_speed_100m") not in ("m/s", None):  # type: ignore[union-attr]
                raise ValueError("wind speed must be in m/s")
            times = [dt.datetime.fromisoformat(t).replace(tzinfo=tz) for t in h["time"]]
            out[name] = PointSeries(times, h["wind_speed_100m"], h["temperature_2m"], h["relative_humidity_2m"])
        return out

    @staticmethod
    def parse_ensemble(data: dict) -> tuple[list[dt.datetime], list[list[float | None]]]:
        tz = ZoneInfo(TZ)
        h = data["hourly"]
        keys = sorted(k for k in h if k.startswith("wind_speed_100m"))
        times = [dt.datetime.fromisoformat(t).replace(tzinfo=tz) for t in h["time"]]
        members = [[h[k][i] for k in keys] for i in range(len(times))]
        return times, members

    # ---------- WeatherSource ----------

    def forecast(self, points: dict[str, tuple[float, float]], days: int, model: str) -> WeatherPull:
        names = list(points)
        params = {
            "latitude": ",".join(f"{points[n][0]:.3f}" for n in names),
            "longitude": ",".join(f"{points[n][1]:.3f}" for n in names),
            "hourly": "wind_speed_100m,temperature_2m,relative_humidity_2m",
            "wind_speed_unit": "ms",
            "timezone": TZ,
            "forecast_days": days,
            "models": model,
        }
        run = self.run_time(model)
        url = f"{self._host('api.open-meteo.com')}/v1/forecast"
        data = self._get(url, params)
        return WeatherPull(
            provider=self.name,
            model=model,
            run_time=run,
            retrieved_at=dt.datetime.now(dt.timezone.utc).replace(microsecond=0),
            points=self.parse_points(data, names),
            attribution=ATTRIBUTION,
            request_urls=[f"{url}?{urllib.parse.urlencode(params)}"],
        )

    def ensemble(self, point: tuple[float, float], days: int, model: str) -> EnsemblePull | None:
        params = {
            "latitude": f"{point[0]:.3f}",
            "longitude": f"{point[1]:.3f}",
            "hourly": "wind_speed_100m",
            "wind_speed_unit": "ms",
            "timezone": TZ,
            "forecast_days": days,
            "models": model,
        }
        try:
            data = self._get(f"{self._host('ensemble-api.open-meteo.com')}/v1/ensemble", params)
        except RuntimeError:
            return None  # confidence falls back to the horizon alone
        times, members = self.parse_ensemble(data)  # type: ignore[arg-type]
        return EnsemblePull(model=model, run_time=None, times=times, members_wind_ms_100m=members)
