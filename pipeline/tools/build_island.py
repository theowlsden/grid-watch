"""Build the island outline and site positions from OpenStreetMap (spec 7.4, decision 12.5).

Downloads the Curaçao coastline and the power features of the seed sites through the Overpass
API, keeps the main island (Klein Curaçao and islets are dropped), simplifies it to roughly
150-400 vertices and smooths it slightly, then writes the island record and the site
coordinates into data/sites.snapshot.json. On the next deploy the CMS fills any empty
outline or coordinates from that snapshot; after that the CMS is the source again.

    python pipeline/tools/build_island.py                 # download and write
    python pipeline/tools/build_island.py --cache DIR     # keep / reuse the raw downloads

OSM data is © OpenStreetMap contributors, ODbL 1.0; the derived outline keeps that
attribution (DATA_LICENSES.md, site credits).
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from shapely.geometry import LineString, Polygon
from shapely.ops import linemerge, polygonize, unary_union

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from paths import SITES_SNAPSHOT  # noqa: E402
from validate import Report, check_sites  # noqa: E402

BBOX = (11.95, -69.25, 12.45, -68.6)  # south, west, north, east: Curaçao and its waters
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
USER_AGENT = "GridWatchCuracao/0.1 (+https://github.com/theowlsden/grid-watch)"
R_EARTH = 6371008.8

# Which OSM features locate each seed site (checked by hand, see the step 8 notes in git log).
# A list means: use the centroid of these features.
SITE_FEATURES: dict[str, list[str]] = {
    "terakora": ["relation/14071783"],  # "Tera Kòrá Windparken"
    "dokweg": ["way/1138435502"],  # "Dokweg Power Plant", operator Aqualectra
    "playakanoa": ["relation/3972363"],  # "Playa Kanoa wind farm"
    # No named feature in OSM: the four turbines east of Playa Kanoa. To be confirmed.
    "koraaltabak": ["node/13424676329", "node/13424676330", "node/13424676331", "node/13424676332"],
}
# Sites whose OSM match is inferred rather than named stay "approximate" until confirmed.
INFERRED = {"koraaltabak"}

METRES_PER_UNIT = 1000.0  # one scene unit = 1 km; the island is about 60 units long
TARGET_VERTICES = (150, 400)


def overpass(query: str, cache: Path | None, name: str) -> dict:
    if cache and (cache / name).exists():
        return json.loads((cache / name).read_text())
    body = urllib.parse.urlencode({"data": query}).encode()
    last: Exception | None = None
    for attempt in range(3):
        for url in ENDPOINTS:
            try:
                req = urllib.request.Request(url, data=body, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(req, timeout=200) as res:
                    data = json.loads(res.read())
                if cache:
                    cache.mkdir(parents=True, exist_ok=True)
                    (cache / name).write_text(json.dumps(data))
                return data
            except Exception as exc:  # noqa: BLE001 - busy servers return HTML or time out
                last = exc
                print(f"  {url}: {exc}", file=sys.stderr)
        time.sleep(20 * (attempt + 1))
    raise SystemExit(f"Overpass unavailable: {last}")


def main_island(coast: dict) -> Polygon:
    lines = [LineString([(p["lon"], p["lat"]) for p in w["geometry"]]) for w in coast["elements"] if len(w.get("geometry", [])) > 1]
    polys = sorted(polygonize(linemerge(unary_union(lines))), key=lambda p: p.area, reverse=True)
    if not polys:
        raise SystemExit("no closed coastline found")
    return polys[0]


def to_metres(lon: float, lat: float, lon0: float, lat0: float) -> tuple[float, float]:
    """Equirectangular projection around (lat0, lon0); the web front end uses the same formula."""
    return (
        math.radians(lon - lon0) * math.cos(math.radians(lat0)) * R_EARTH,
        math.radians(lat - lat0) * R_EARTH,
    )


def to_lonlat(x: float, y: float, lon0: float, lat0: float) -> tuple[float, float]:
    return (
        lon0 + math.degrees(x / (R_EARTH * math.cos(math.radians(lat0)))),
        lat0 + math.degrees(y / R_EARTH),
    )


def chaikin(coords: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """One round of corner cutting: softens the toy outline without moving it noticeably."""
    ring = coords[:-1]
    out = []
    for i, p in enumerate(ring):
        q = ring[(i + 1) % len(ring)]
        out += [(0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]), (0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1])]
    return out + [out[0]]


def simplify_outline(poly: Polygon, lon0: float, lat0: float) -> tuple[list[list[float]], dict]:
    metric = Polygon([to_metres(x, y, lon0, lat0) for x, y in poly.exterior.coords])
    tol = 150.0
    for _ in range(20):
        simple = metric.simplify(tol, preserve_topology=True)
        smooth = Polygon(chaikin(list(simple.exterior.coords))).simplify(tol / 4, preserve_topology=True)
        n = len(smooth.exterior.coords) - 1
        if n > TARGET_VERTICES[1]:
            tol *= 1.25
        elif n < TARGET_VERTICES[0]:
            tol *= 0.8
        else:
            break
    if not smooth.exterior.is_ccw:  # GeoJSON exterior rings are counter-clockwise
        smooth = Polygon(list(smooth.exterior.coords)[::-1])
    ring = [[round(v, 5) for v in to_lonlat(x, y, lon0, lat0)] for x, y in smooth.exterior.coords]
    stats = {
        "vertices": len(ring) - 1,
        "tolerance_m": round(tol),
        "area_km2": round(metric.area / 1e6, 1),
        "area_simplified_km2": round(smooth.area / 1e6, 1),
    }
    return ring, stats


def site_positions(power: dict) -> dict[str, tuple[float, float, str]]:
    found = {f"{e['type']}/{e['id']}": e for e in power["elements"]}
    out = {}
    for slug, ids in SITE_FEATURES.items():
        pts = []
        for fid in ids:
            e = found.get(fid)
            if not e:
                raise SystemExit(f"{slug}: OSM feature {fid} not found; check SITE_FEATURES")
            c = e.get("center") or {"lat": e["lat"], "lon": e["lon"]}
            pts.append((c["lat"], c["lon"]))
        lat = sum(p[0] for p in pts) / len(pts)
        lon = sum(p[1] for p in pts) / len(pts)
        # rounded to about 100 m: what the map needs, no finer (spec 7.4)
        out[slug] = (round(lat, 3), round(lon, 3), f"https://www.openstreetmap.org/{ids[0]}")
    return out


def build(cache: Path | None, out: Path) -> int:
    south, west, north, east = BBOX
    bbox = f"{south},{west},{north},{east}"
    print("downloading coastline ...")
    coast = overpass(f'[out:json][timeout:150];way["natural"="coastline"]({bbox});out geom;', cache, "coast.json")
    print("downloading power features ...")
    power = overpass(
        f'[out:json][timeout:120];(nwr["power"="plant"]({bbox});nwr["power"="generator"]["generator:source"="wind"]({bbox}););out tags center;',
        cache,
        "power.json",
    )
    today = dt.date.today().isoformat()

    island = main_island(coast)
    c = island.centroid
    lat0, lon0 = round(c.y, 4), round(c.x, 4)
    ring, stats = simplify_outline(island, lon0, lat0)

    snap = json.loads(out.read_text(encoding="utf-8"))
    snap["island"] = {
        "version": f"osm-{today}",
        "outline": {"type": "Polygon", "coordinates": [ring]},
        "anchorLat": lat0,
        "anchorLon": lon0,
        "metresPerUnit": METRES_PER_UNIT,
        "rotation": 0,
        "source": {
            "name": "OpenStreetMap contributors",
            "licence": "ODbL-1.0",
            "url": "https://www.openstreetmap.org/copyright",
            "retrieved_at": today,
            **stats,
        },
    }
    positions = site_positions(power)
    for s in snap["sites"]:
        if s["slug"] in positions:
            lat, lon, url = positions[s["slug"]]
            s["lat"], s["lon"] = lat, lon
            s["placement"] = "approximate" if s["slug"] in INFERRED else "exact"
            s["source_url"] = url
            s["source_note"] = (
                f"OpenStreetMap, retrieved {today}" + ("; inferred from unnamed turbines, to be confirmed" if s["slug"] in INFERRED else "")
            )
    snap["_comment"] = (
        "Export of the CMS sites and island records. Island outline and site positions from "
        "OpenStreetMap (© OpenStreetMap contributors, ODbL) via pipeline/tools/build_island.py. "
        "placeholder_uv is the old stylised position, used only when there is no outline."
    )

    report = Report()
    check_sites(snap, report)
    for e in report.errors:
        print(f"ERROR    {e}")
    if not report.ok:
        print("result does not match the sites schema; nothing written")
        return 1
    out.write_text(json.dumps(snap, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {out}: outline {stats['vertices']} vertices (tolerance {stats['tolerance_m']} m), "
          f"area {stats['area_km2']} km² → {stats['area_simplified_km2']} km²")
    for slug, (lat, lon, url) in positions.items():
        print(f"  {slug:12} {lat:.3f}, {lon:.3f}  {url}")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--cache", type=Path, help="directory to keep or reuse the raw Overpass downloads")
    p.add_argument("--out", type=Path, default=SITES_SNAPSHOT)
    args = p.parse_args(argv)
    return build(args.cache, args.out)


if __name__ == "__main__":
    sys.exit(main())
