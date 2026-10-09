# Methodology

The public version is the site's methodology page (`/methodology`, `web/src/app/methodology/page.tsx`),
which reads the rules from `pipeline/stress_config.yaml` at build time. In short:

- **Stress index** 0 to 100 per evening (19:00 to 22:00 Curaçao time) from fixed rules (`rules-v0`):
  `100 × (0.65 × wind stress + 0.35 × demand proxy)`. Not a probability; not calibrated yet.
- **Wind stress** from estimated island-wide wind output: a generic power curve
  `(v³ − 3³) / (12³ − 3³)` between cut-in 3 m/s and rated 12 m/s, none above 75 % output.
- **Demand proxy** from the evening heat index (US NWS formula) at the Dokweg area, 31 to 39 °C.
- **Confidence** from the horizon and the ECMWF ensemble spread.
- **Inputs**: Open-Meteo, ECMWF IFS 0.25° and its 51-member ensemble; model run time stored.
- **Record**: two runs a day, each archived unchanged with its inputs (`data/history/`).

See `docs/data_gaps.md` for what public data cannot show, and SPEC sections 5 and 12 for decisions.

## Editorial rule for news (spec 7.3)

News items never change or imply a change to the outlook. Reports about outages or about the
utility cite a public source or say "reported by" with the origin; unsourced claims are not
published. Corrections are welcome through GitHub issues (data corrections need a public source).
