"""NOAA GFS source from AWS Open Data (decision 18): CC BY 4.0, commercial use allowed, every run
since 2021, so it also serves the Phase 3 backtests. Planned: reads only the needed GRIB2
messages (80/100 m wind, 2 m temperature and humidity) for the Curaçao points via the .idx
byte ranges. Not implemented yet; choose it in stress_config.yaml once it is."""

from __future__ import annotations


class Gfs:
    name = "noaa-gfs"

    def forecast(self, points, days, model):  # noqa: ANN001
        raise NotImplementedError("the NOAA GFS source is planned (decision 18); use provider: open-meteo for now")

    def ensemble(self, point, days, model):  # noqa: ANN001
        return None
