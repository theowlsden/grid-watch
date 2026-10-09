"""Upgrading a CMS that was seeded before step 8 (stylised island, no coordinates): the OSM
migration fills the outline and coordinates, and keeps anything edited in the CMS."""

import json
import os
import shutil
import subprocess
import time
from pathlib import Path

import pytest

from pb_helpers import ROOT, SUPERUSER, Api, _free_port

MIGRATIONS = sorted((ROOT / "cms/pb_migrations").glob("*.js"))


def run(binary, *args, env):
    subprocess.run([binary, *args], env=env, check=True, capture_output=True)


def test_upgrade_fills_empty_geography_and_keeps_edits(tmp_path):
    binary = os.environ.get("POCKETBASE_BIN")
    if not binary:
        pytest.skip("POCKETBASE_BIN not set")
    new = json.loads((ROOT / "data/sites.snapshot.json").read_text())
    assert new["island"]["outline"], "run after build_island.py"

    # the snapshot as it was before step 8
    old = json.loads(json.dumps(new))
    old["island"] = {"version": "stylised-0", "outline": None, "anchorLat": None, "anchorLon": None, "metresPerUnit": None, "rotation": 0}
    for s in old["sites"]:
        s.update(lat=None, lon=None, placement="approximate", source_url=None, source_note="Placeholder position")
    (tmp_path / "old.json").write_text(json.dumps(old))
    before = tmp_path / "before"
    before.mkdir()
    for m in MIGRATIONS:
        if m.name < "1791600000":
            shutil.copy(m, before / m.name)

    data = tmp_path / "pb_data"
    hooks = f"--hooksDir={ROOT / 'cms/pb_hooks'}"
    env = {**os.environ, "PB_SEED_FILE": str(tmp_path / "old.json")}
    run(binary, "migrate", "up", f"--dir={data}", f"--migrationsDir={before}", hooks, env=env)
    run(binary, "superuser", "upsert", *SUPERUSER, f"--dir={data}", env=env)

    # someone placed Dokweg by hand in the CMS before the upgrade
    port = _free_port()
    proc = subprocess.Popen([binary, "serve", f"--http=127.0.0.1:{port}", f"--dir={data}", f"--migrationsDir={before}", hooks, "--hooksWatch=false"], env=env)
    api = Api(f"http://127.0.0.1:{port}")
    try:
        for _ in range(100):
            try:
                if api.call("GET", "/api/health")[0] == 200:
                    break
            except OSError:
                time.sleep(0.1)
        token = api.token("_superusers", *SUPERUSER)
        _, body, _ = api.call("GET", "/api/collections/sites/records?filter=(slug='dokweg')", token=token)
        api.call("PATCH", f"/api/collections/sites/records/{body['items'][0]['id']}", {"lat": 12.12, "lon": -68.92, "placement": "exact"}, token=token)
    finally:
        proc.terminate()
        proc.wait(timeout=10)

    # upgrade with the new snapshot and every migration
    env["PB_SEED_FILE"] = str(ROOT / "data/sites.snapshot.json")
    run(binary, "migrate", "up", f"--dir={data}", f"--migrationsDir={ROOT / 'cms/pb_migrations'}", hooks, env=env)
    port = _free_port()
    proc = subprocess.Popen([binary, "serve", f"--http=127.0.0.1:{port}", f"--dir={data}", f"--migrationsDir={ROOT / 'cms/pb_migrations'}", hooks, "--hooksWatch=false"], env=env)
    api = Api(f"http://127.0.0.1:{port}")
    try:
        for _ in range(100):
            try:
                if api.call("GET", "/api/health")[0] == 200:
                    break
            except OSError:
                time.sleep(0.1)
        _, isl, _ = api.call("GET", "/api/collections/island/records")
        rec = isl["items"][0]
        assert rec["outline"] == new["island"]["outline"]
        assert rec["anchorLat"] == new["island"]["anchorLat"] and rec["version"] == new["island"]["version"]
        assert rec["source"]["licence"] == "ODbL-1.0"
        _, sites, _ = api.call("GET", "/api/collections/sites/records?perPage=50")
        got = {s["slug"]: s for s in sites["items"]}
        want = {s["slug"]: s for s in new["sites"]}
        for slug in ("terakora", "playakanoa", "koraaltabak"):
            assert (got[slug]["lat"], got[slug]["lon"]) == (want[slug]["lat"], want[slug]["lon"])
            assert got[slug]["placement"] == want[slug]["placement"]
        assert (got["dokweg"]["lat"], got["dokweg"]["lon"]) == (12.12, -68.92), "a CMS edit must not be overwritten"
    finally:
        proc.terminate()
        proc.wait(timeout=10)
