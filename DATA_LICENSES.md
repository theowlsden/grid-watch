# Third-party data and licences

Every third-party source used in the UI, the pipeline or the docs is listed here with its licence, the attribution text we show, and the retrieval date. Respect each licence. A source moves from "planned" to "in use" only when this table has a URL and a retrieval date for it.

Fields marked **TODO** are still to be filled in by the maintainer. Do not guess them.

## Data sources

| Source | Used for | Licence / terms | Attribution text | URL | Retrieved | Status |
|---|---|---|---|---|---|---|
| OpenStreetMap contributors | Island outline (coastline), site positions (power plant and wind turbine features) | ODbL 1.0 | "Map data from OpenStreetMap", linked to the copyright page (shown on the island) | https://www.openstreetmap.org/copyright | 2026-10-09 | In use (`pipeline/tools/build_island.py`) |
| Open-Meteo | Weather forecasts (ECMWF IFS 0.25° and its ensemble) for the stress outlook | CC BY 4.0; free API for non-commercial use | Weather data by Open-Meteo.com (on the risk card and the methodology page) | https://open-meteo.com/en/licence | 2026-10-09 | In use (Phase 2) |
| NOAA GFS, via dynamical.org (Icechunk Zarr on AWS Open Data, `s3://dynamical-noaa-gfs/noaa-gfs-forecast/v0.2.7.icechunk`) | Second weather source (100 m wind, 2 m temperature and humidity); archived forecasts since May 2021 for the Phase 3 hindcasts | CC BY 4.0 (NOAA data, processed by dynamical.org), commercial use allowed | NOAA GFS via dynamical.org | https://dynamical.org/catalog/noaa-gfs-forecast/ | 2026-10-10 | Available (`provider: noaa-gfs`); Open-Meteo stays the live default |
| Grid Watch hindcasts (`data/hindcasts/gfs/`) | Retrospective outlooks from archived GFS runs since Jan 2025, for the Phase 3 backtests | CC BY 4.0, derived from NOAA GFS via dynamical.org | NOAA GFS via dynamical.org | data/hindcasts/README.md | 2026-10-10 | Built (Phase 3.2) |
| Iowa Environmental Mesonet ASOS archive: METAR TNCC, Hato airport (`data/observations/tncc/`) | Observed hourly 10 m wind and 2 m temperature for the forecast-error check (spec 5.3 A) | Public domain; attribution requested | Iowa Environmental Mesonet, Iowa State University | https://mesonet.agron.iastate.edu/disclaimer.php | 2026-10-10 | In use (Phase 3) |
| ECMWF open data (IFS) | Optional second model | CC BY 4.0, commercial use allowed | Contains modified ECMWF open data (CC BY 4.0) | https://www.ecmwf.int/en/forecasts/datasets/open-data | TODO | Planned (optional) |
| Natural Earth | Fallback island outline only if OSM is not used | Public domain | Made with Natural Earth | https://www.naturalearthdata.com/about/terms-of-use/ | n/a | Fallback, not used |
| RAC (Regulatory Authority of Curaçao) energy reports | Fleet figures shown in the UI: wind 69 MW, conventional 151 MW, registered PV 16.6 MW (all 2024) | TODO | TODO | TODO | TODO | In use in the prototype |
| Aqualectra annual reports | Sales and production anchors | TODO | TODO | TODO | TODO | Planned (Phase 3) |
| Aqualectra / DNV investigation, 27 Aug 2025 | Event database, case study | TODO | TODO | TODO | TODO | In use (event summary) |
| CBS Curaçao | Annual and monthly electricity statistics | TODO | TODO | TODO | TODO | Planned (Phase 3) |
| ERA5 (Copernicus Climate Change Service) | Historical weather modelling | Copernicus licence | TODO | TODO | TODO | Planned (Phase 3) |
| NASA POWER | Historical weather cross-check | TODO | TODO | TODO | TODO | Planned (Phase 3) |
| Global Wind Atlas | Static wind resource layer | TODO | TODO | TODO | TODO | Planned |

Electricity Maps is used for visual comparison only and is never republished or treated as ground truth (its Curaçao data is marked synthetic).

Each event in `data/events/events.yaml` carries its own source links (publisher, title, URL, publication and retrieval date). Event titles and source names stay in their original language.

## Software and fonts bundled with the site

| Component | Licence | Notes |
|---|---|---|
| three.js | MIT | Pinned (0.186.1) and bundled with the site; the prototype loads r128 from cdnjs |
| Baloo 2 | SIL Open Font License 1.1 | Self-hosted from the `@fontsource/baloo-2` package; licence in `web/public/fonts/Baloo2-OFL.txt` |
| Nunito | SIL Open Font License 1.1 | Self-hosted from the `@fontsource/nunito` package; licence in `web/public/fonts/Nunito-OFL.txt` |
| Next.js, React | MIT | Build framework and UI library |

All runtime dependencies must be compatible with MIT distribution; CI will check this once the web and pipeline dependencies land.
