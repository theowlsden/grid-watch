"""Downloads the Hato airport METAR (TNCC) from the Iowa Environmental Mesonet into
data/observations/tncc/YYYY.csv (spec 5.3 A, decision 20). Routine hourly reports only.
Rerunning refreshes the files; the IEM asks for at most one request per second.

    python pipeline/tools/fetch_metar.py --start 2025-01-01
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from observations import parse_iem, write_year  # noqa: E402
from paths import ROOT  # noqa: E402

URL = "https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py"
USER_AGENT = "GridWatchCuracao/0.1 (+https://github.com/theowlsden/grid-watch)"
OUT = ROOT / "data" / "observations" / "tncc"


def fetch(start: dt.datetime, end: dt.datetime) -> str:
    params = [("station", "TNCC"), *[("data", d) for d in ("tmpf", "relh", "drct", "sknt", "gust")]]
    params += [("sts", start.strftime("%Y-%m-%dT%H:%MZ")), ("ets", end.strftime("%Y-%m-%dT%H:%MZ"))]
    params += [("tz", "Etc/UTC"), ("format", "onlycomma"), ("missing", "empty"), ("trace", "empty"), ("report_type", "3")]
    req = urllib.request.Request(f"{URL}?{urllib.parse.urlencode(params)}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as res:
        return res.read().decode()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--start", type=dt.date.fromisoformat, required=True)
    ap.add_argument("--end", type=dt.date.fromisoformat, default=dt.date.today())
    args = ap.parse_args(argv)
    OUT.mkdir(parents=True, exist_ok=True)
    utc = lambda d: dt.datetime(d.year, d.month, d.day, tzinfo=dt.timezone.utc)  # noqa: E731
    for year in range(args.start.year, args.end.year + 1):
        start = max(utc(dt.date(year, 1, 1)), utc(args.start))
        end = min(utc(dt.date(year + 1, 1, 1)), utc(args.end))
        rows = parse_iem(fetch(start, end))
        write_year(OUT / f"{year}.csv", rows)
        print(f"{year}: {len(rows)} reports, {start:%Y-%m-%d} to {end:%Y-%m-%d}", flush=True)
        time.sleep(2)  # the IEM throttles at one request per second
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
