# pipeline

Python 3.12. Daily stress outlook (Phase 2) plus the data tools used now.

```sh
python3 -m venv pipeline/.venv
pipeline/.venv/bin/pip install -r pipeline/requirements-dev.txt

pipeline/.venv/bin/python pipeline/validate.py            # check all published JSON
pipeline/.venv/bin/python pipeline/tools/build_events.py  # rebuild events.json from data/events/events.yaml
pipeline/.venv/bin/python -m pytest -q pipeline/tests
```

| File | Purpose |
|---|---|
| `validate.py` | JSON Schema checks (`schemas/`) plus rules: level matches index, consecutive dates, UTC issue time, known site slugs, unique event ids, events.json up to date, published events all sourced |
| `events.py`, `tools/build_events.py` | `data/events/events.yaml` → `web/public/data/events.json`; only events with filled-in sources are published |
| `paths.py` | repository paths |
| `tests/` | unit tests (spec 11) |

Planned (Phase 2): `fetch_weather.py`, `power_curve.py`, `stress.py` with `stress_config.yaml`, `publish.py`, `backtest/`. Later: `tools/build_island.py` (OpenStreetMap outline).
