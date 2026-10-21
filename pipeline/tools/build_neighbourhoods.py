"""Neighbourhood names from OpenStreetMap (decision 26) for the report form and the CMS's check
of reported areas: data/neighbourhoods.json. Areas (place=neighbourhood|suburb|quarter
relations or ways) come first; names mapped only as a point are added after them.

OpenStreetMap data, ODbL 1.0: the file carries the credit and stays under ODbL.

    python pipeline/tools/build_neighbourhoods.py
"""

from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_island import overpass  # noqa: E402
from paths import ROOT  # noqa: E402

OUT = ROOT / "data" / "neighbourhoods.json"
QUERY = """[out:json][timeout:120];
area["ISO3166-1"="CW"]->.cw;
nwr(area.cw)["place"~"^(neighbourhood|suburb|quarter)$"]["name"];
out tags center;"""


def build(data: dict) -> list[dict]:
    by_name: dict[str, dict] = {}
    # areas first, so a name mapped both as an area and as a label point keeps the area
    for e in sorted(data["elements"], key=lambda e: e["type"] == "node"):
        name = " ".join(e["tags"]["name"].split())
        key = name.casefold()
        if key in by_name:
            continue
        c = e.get("center") or {"lat": e.get("lat"), "lon": e.get("lon")}
        by_name[key] = {
            "name": name,
            "osm": f"{e['type']}/{e['id']}",
            "area": e["type"] != "node",
            "lat": round(c["lat"], 5),
            "lon": round(c["lon"], 5),
        }
    return sorted(by_name.values(), key=lambda n: n["name"].casefold())


def main(argv: list[str] | None = None) -> int:
    rows = build(overpass(QUERY, None, "neighbourhoods.json"))
    doc = {
        "source": {
            "name": "OpenStreetMap contributors",
            "licence": "ODbL 1.0",
            "url": "https://www.openstreetmap.org/copyright",
            "retrieved_at": dt.date.today().isoformat(),
            "note": "Names of places tagged neighbourhood, suburb or quarter in Curaçao. Areas are mapped as polygons in OpenStreetMap, the others only as a point.",
        },
        "neighbourhoods": rows,
    }
    OUT.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(rows)} names, {sum(r['area'] for r in rows)} with an area")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
