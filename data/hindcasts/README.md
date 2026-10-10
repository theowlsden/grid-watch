# Hindcasts

**Retrospective outlooks, not forecasts that were issued at the time.** Each record is what the
Grid Watch rules would have said at a past issue time (06:00 and 16:00 Curaçao time), computed
later from the archived NOAA GFS run that had been published by then (spec 5.3, decision 20).

- `gfs/YYYY-MM.jsonl`: one record per issue time, sorted. Each holds the outlook for the next
  seven evenings, the evening inputs it was built from (hub-height wind per wind site, heat and
  humidity at the demand point), and GFS 10 m wind and 2 m temperature at Hato airport (TNCC) for
  every native lead time up to 168 h, for the forecast-error check against the airport METAR.
- `gfs/manifest.json`: the source and dataset version, rules version and config hash, the issue
  times, the six-hour publication rule, counts, and any issue time that could not be built.

## How they are made

```sh
python pipeline/tools/run_hindcasts.py --start 2025-01-01
```

No leakage: an issue time only uses a GFS run that started at least six hours earlier (NOAA
publishes a run about 3.5 to 5 hours after it starts). There is no GFS ensemble here, so the
confidence label uses the forecast horizon alone. `pipeline/hindcast.py` (`rescore`) re-runs the
rules on the stored inputs, e.g. with other weights, without downloading again.

## Source and licence

NOAA GFS 0.25°, processed by dynamical.org (https://dynamical.org/catalog/noaa-gfs-forecast/),
CC BY 4.0. Credit: "NOAA GFS via dynamical.org". These files are derived from it and shared
under the same licence.
