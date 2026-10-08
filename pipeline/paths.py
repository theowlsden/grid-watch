"""Repository paths used by the pipeline and its tools."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMAS = ROOT / "schemas"
EVENTS_YAML = ROOT / "data" / "events" / "events.yaml"
SITES_SNAPSHOT = ROOT / "data" / "sites.snapshot.json"
# Files served under /data. In production the pipeline writes to a volume mounted there;
# the copies in web/public/data are what the static build and local development use.
PUBLIC_DATA = ROOT / "web" / "public" / "data"
FORECAST_JSON = PUBLIC_DATA / "forecast.json"
EVENTS_JSON = PUBLIC_DATA / "events.json"
