# Grid Watch Curaçao

> **Experimental research prototype, not an operational utility forecast.**
> Grid Watch estimates electricity supply stress in Curaçao from public data only. It does not predict blackouts or outages, it is not affiliated with Aqualectra, MDC or RAC, and it cannot see which generators are running, real demand or battery charge. Do not use it to make safety, business or operational decisions.

*Grid Watch by Noir Visuals*

A public dashboard that shows, in plain language and on a 3D model of the island, an outlook for electricity supply stress in Curaçao over the next seven days. The research question behind it: how much warning can public data give, 1 to 7 days ahead?

## Status

Phase 1 (productionising the front end). Everything currently shown is **example data** and is labelled as such on screen. See [docs/SPEC.md](docs/SPEC.md) for the full requirements and phase plan.

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
cms/        PocketBase migrations and hooks (news, sites, island)
bot/        Telegram news bot (Phase 1b)
deploy/     Dockerfiles and compose for Coolify, static-server config
assets/     Source 3D models and artwork
docs/       Spec, prototype, methodology, data gaps, results
```

## How to run

The production front end is not ported yet. For now, the reference prototype is a single HTML file with no build step:

```sh
# from the repo root, any static server works
python3 -m http.server 8000
# then open http://localhost:8000/docs/prototype/grid-watch-prototype.html
```

The prototype loads three.js and fonts from public CDNs, so it needs a network connection. Instructions for `web/`, `pipeline/` and `cms/` will be added here as each part lands.

## Configuration and secrets

No secrets are committed. Copy `.env.example` to `.env` for local work; in production, values live in Coolify environment variables. Secret scanning (gitleaks) runs in CI and can run as a pre-commit hook:

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
