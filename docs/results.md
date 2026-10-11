# Results

_Retrospective experiment on archived forecasts (spec 5.3). Generated 2026-10-11T00:45:47Z by `pipeline/tools/run_backtest.py` from stored files only; do not edit by hand._

Rules rules-v0 0.1.0 on 1294 hindcast issue times (2025-01-01 to 2026-10-09, 06:00 and 16:00 Curaçao time) from NOAA GFS via dynamical.org. Events: 0 with a public source, scored for evenings 2025-01-01 to 2026-10-09.

## Read this first

- Retrospective experiment: computed now from archived GFS runs, not outlooks issued at the time.
- Very small sample: 0 event evenings. Every rate here can change a lot with one more event.
- The index is not a probability; Brier scores read it as one only to show how far off that would be.
- The evening window is 19:00 to 22:00: events outside it (such as the 02:30 blackout of 27 August 2025) are not what the rules look at.
- Weather cannot see generator outages or maintenance, the cause of several recent events.
- Forecast error is measured at 10 m at Hato airport; the rules use 100 m wind at the parks, which is not measured publicly.
- 5 known events are left out until they have a public source.
- GFS differs from the airport already in the first hours (10 m wind +2.6 m/s, temperature -1.6 °C): its 0.25° grid cells around Hato are mostly sea, the station is on land. That is a difference of place, not forecast skill; read the change of error with the horizon, not its level. A cooler GFS also means a lower heat index for the demand proxy.
- The seasonal-average baseline only has a value from 2025-12-26, once a full earlier month of the same name is in the data.

## A. Weather forecast error at Hato airport (GFS against METAR TNCC)

| Horizon (h) | Wind 10 m: n | MAE m/s | RMSE | Bias | Temp 2 m: n | MAE °C | RMSE | Bias |
|---|---|---|---|---|---|---|---|---|
| 0–6 | 7699 | 2.66 | 2.91 | 2.64 | 7697 | 1.74 | 2.30 | -1.64 |
| 6–12 | 7697 | 3.19 | 3.41 | 3.19 | 7698 | 1.62 | 2.16 | -1.33 |
| 12–24 | 15384 | 3.09 | 3.35 | 3.07 | 15383 | 1.68 | 2.21 | -1.49 |
| 24–48 | 30732 | 3.13 | 3.41 | 3.10 | 30730 | 1.68 | 2.22 | -1.49 |
| 48–72 | 30684 | 3.07 | 3.37 | 3.00 | 30682 | 1.69 | 2.24 | -1.51 |
| 72–96 | 30640 | 3.03 | 3.36 | 2.92 | 30638 | 1.71 | 2.25 | -1.53 |
| 96–120 | 30592 | 3.04 | 3.39 | 2.91 | 30590 | 1.71 | 2.26 | -1.53 |
| 120–144 | 10170 | 3.04 | 3.39 | 2.89 | 10168 | 1.72 | 2.26 | -1.56 |
| 144–168 | 11421 | 3.05 | 3.41 | 2.90 | 11418 | 1.65 | 2.18 | -1.50 |

Bias is forecast minus observed.

## How often each level would have shown

Same-evening outlook from the 06:00 issue, evenings per month.

| Month | Low | Moderate | Elevated | High |
|---|---|---|---|---|
| 2025-01 | 21 | 6 | 4 | 0 |
| 2025-02 | 25 | 3 | 0 | 0 |
| 2025-03 | 17 | 12 | 2 | 0 |
| 2025-04 | 19 | 9 | 2 | 0 |
| 2025-05 | 23 | 7 | 1 | 0 |
| 2025-06 | 30 | 0 | 0 | 0 |
| 2025-07 | 31 | 0 | 0 | 0 |
| 2025-08 | 22 | 6 | 0 | 3 |
| 2025-09 | 22 | 3 | 1 | 4 |
| 2025-10 | 5 | 11 | 6 | 9 |
| 2025-11 | 16 | 13 | 1 | 0 |
| 2025-12 | 20 | 5 | 6 | 0 |
| 2026-01 | 18 | 12 | 1 | 0 |
| 2026-02 | 24 | 3 | 1 | 0 |
| 2026-03 | 19 | 8 | 4 | 0 |
| 2026-04 | 15 | 12 | 3 | 0 |
| 2026-05 | 31 | 0 | 0 | 0 |
| 2026-06 | 30 | 0 | 0 | 0 |
| 2026-07 | 30 | 1 | 0 | 0 |
| 2026-08 | 29 | 1 | 1 | 0 |
| 2026-09 | 26 | 4 | 0 | 0 |
| 2026-10 | 6 | 3 | 0 | 0 |

## C. Stress-event detection

0 event evenings out of 647 scored evenings.

No sourced events fall in the scored period yet, so detection cannot be scored. Add public sources to `data/events/events.yaml` and run the report again.

## Case studies

None yet: the case-study events (spec 5.3) need public sources first.

B. Demand proxy: not scored yet; it needs public monthly demand totals (spec 5.3 B).
