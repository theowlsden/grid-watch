# pipeline

Python 3.12. The stress outlook (Phase 2, spec 5.2) and the data tools.

```sh
python3 -m venv pipeline/.venv
pipeline/.venv/bin/pip install -r pipeline/requirements-dev.txt

GRIDWATCH_DATA_DIR=var pipeline/.venv/bin/python pipeline/run_daily.py   # one run (writes var/data/...)
pipeline/.venv/bin/python pipeline/validate.py                            # check all published JSON
pipeline/.venv/bin/python pipeline/tools/build_events.py                  # events.yaml -> events.json
pipeline/.venv/bin/python pipeline/tools/build_island.py --cache /tmp/osm # outline and site positions from OSM
pipeline/.venv/bin/python -m pytest -q pipeline/tests
```

## How a run works (`run_daily.py`)

1. Checks its inputs (sites snapshot, events).
2. Fetches hourly forecasts of hub-height wind at the wind parks and heat at the demand point,
   plus the ensemble spread, from the provider set in `stress_config.yaml` (`sources/`).
3. Builds the outlook (`outlook.py`, rules in `stress.py`, `power_curve.py`): the evening window
   19:00 to 22:00 local, today if the run is before 19:00, otherwise from tomorrow, up to 7 days
   (at least 3). Refuses inputs from after the issue time (no leakage).
4. Validates the result against `schemas/forecast.schema.json`.
5. Writes an immutable archive copy with all inputs to `data/history/YYYY/MM/DD/HHMM-<trigger>.json`,
   then `data/forecast.json` when `GRIDWATCH_PUBLISH=1`, otherwise `data/preview/forecast.json`.
6. Writes `data/heartbeat.json`. A failed run keeps the last good forecast in place.

Scheduled at 06:00 and 16:00 Curaçao time (`deploy/pipeline/crontab`). `--trigger manual` is for
the Telegram bot (later); manual runs are limited to one per 30 minutes.

## Rules

Every number is in `stress_config.yaml` (weights, thresholds, power curve, window, source). These
are transparent starting assumptions, not fitted values; Phase 3 fits them against the sourced
events. Bump `version` on any change; each issuance records the version and the file's hash.
The public methodology page (`/methodology`) reads the same file.

## Weather sources (decision 18)

| Provider | Module | Status |
|---|---|---|
| `open-meteo` | `sources/open_meteo.py` | in use: ECMWF IFS 0.25 deg plus its 51-member ensemble; free API, non-commercial, CC BY 4.0 |
| `noaa-gfs` | `sources/gfs.py` | planned: AWS Open Data, also the archive for Phase 3 backtests |

| File | Purpose |
|---|---|
| `validate.py` | schema checks plus rules a schema cannot express |
| `events.py`, `tools/build_events.py` | `data/events/events.yaml` -> `events.json`, sourced events only |
| `tools/build_island.py`, `tools/export_sites.py` | OSM geography; refresh the snapshot from the CMS |
| `healthcheck.py` | container health from the heartbeat |
