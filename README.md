# Grid Watch Curaçao

> **Experimental research prototype, not an operational utility forecast.**
> Grid Watch estimates electricity supply stress in Curaçao from public data only. It does not predict blackouts or outages, it is not affiliated with Aqualectra, MDC or RAC, and it cannot see which generators are running, real demand or battery charge. Do not use it to make safety, business or operational decisions.

*Grid Watch by Noir Visuals*

A public dashboard that shows, in plain language and on a 3D model of the island, an outlook for electricity supply stress in Curaçao over the next seven days. The research question behind it: how much warning can public data give, 1 to 7 days ahead?

## Status

**Live since 13 October 2026** at [grid.noirvisuals.studio](https://grid.noirvisuals.studio). The outlook is calculated from live weather forecasts (Open-Meteo, ECMWF model) twice a day, at 06:00 and 16:00 Curaçao time, and every issued outlook is archived unchanged.

The data is live, **the outlook is not a prediction**. It is a rule-based stress index for the evening peak, from fixed, published rules that have not been calibrated against real events yet. It says how strained supply could be given the forecast weather; it does not say whether an outage will happen, and it is not a probability.

- Reported grid events and the backtest results page are built but switched off until the event list has reliable public sources.
- Phase 3 (testing the rules on archived forecasts) is under way: [docs/results.md](docs/results.md).

See [docs/SPEC.md](docs/SPEC.md) for the full requirements and phase plan, and the site's "How this works" page for the rules.

## What it is, and what it is not

| It is | It is not |
|---|---|
| An estimate of supply stress from public weather and published fleet figures | A prediction of blackouts or of utility decisions |
| A transparent, rule-based stress outlook (Low / Moderate / Elevated / High) | A probability, until it has been calibrated against sourced events |
| Open about what public data cannot show | A substitute for official information from the utility |

## Repository layout

```
web/        Next.js (App Router) + TypeScript front end, static export
pipeline/   Python: weather fetch, power curve, stress index, backtests, publish
data/       Sourced event database and the committed sites/island snapshot
cms/        PocketBase migrations and hooks (news, sites, island, translations)
bot/        Telegram bot: news drafts and manual pipeline runs
deploy/     Dockerfiles and compose for Coolify, static-server config
assets/     Source 3D models and artwork
docs/       Spec, prototype, methodology, data gaps, results
```

## How to run

The front end lives in `web/` (Next.js, static export). It needs Node.js 22 or later.

```sh
cd web
npm ci
npm run dev        # http://localhost:3000
npm run build      # static site in web/out/
```

To check a production build locally, serve `web/out/` with any static server, for example `python3 -m http.server 8000 -d web/out`.

The page loads `/data/forecast.json` (and `/data/events.json` when events are switched on) at runtime. In production these are written by the pipeline. In development they come from `web/public/data/`, which holds **example data**, shown with an "Example data" tag on screen so it is never mistaken for a live outlook. The island outline and site positions come from OpenStreetMap, via `data/sites.snapshot.json`.

### Data

- `data/events/events.yaml` is the event database; `web/public/data/events.json` is built from it and only contains events whose sources are filled in.
- `schemas/` holds JSON Schemas for every published file; `pipeline/validate.py` checks them.

```sh
python3 -m venv pipeline/.venv && pipeline/.venv/bin/pip install -r pipeline/requirements-dev.txt
pipeline/.venv/bin/python pipeline/tools/build_events.py   # after editing events.yaml
pipeline/.venv/bin/python pipeline/validate.py             # checks every published JSON file
```

Papiamentu translation: see [docs/translating.md](docs/translating.md).

The original single-file prototype is kept as the visual reference in `docs/prototype/grid-watch-prototype.html`; open it through any static server.

## Configuration and secrets

No secrets are committed. Copy `.env.example` to `.env` for local work; in production, values live in Coolify environment variables. Secret scanning ([betterleaks](https://github.com/betterleaks/betterleaks), the successor to gitleaks) runs in CI and can run as a pre-commit hook:

```sh
pipx install pre-commit   # or: pip install pre-commit
pre-commit install
```

## Licences

| Part | Licence |
|---|---|
| Code (`web/`, `pipeline/`, `cms/`, `bot/`, `deploy/`) | MIT, see [LICENSE](LICENSE) |
| Docs, published forecasts and event database (`docs/`, `data/`) | CC BY 4.0, see [docs/LICENSE](docs/LICENSE) and [data/LICENSE](data/LICENSE) |
| 3D models and artwork (`assets/`, `web/public/models/`) | CC BY 4.0, see [assets/LICENSE](assets/LICENSE) |
| Third-party data (OpenStreetMap, Open-Meteo and others) | Their own licences, see [DATA_LICENSES.md](DATA_LICENSES.md) |
| Names and logos | Not licensed for reuse, see [TRADEMARKS.md](TRADEMARKS.md) |

## Contributing

Issues and corrections are welcome, especially corrections to events with a public source. See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). To report a security problem, see [SECURITY.md](SECURITY.md).
