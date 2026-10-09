"""Starts the pinned PocketBase binary with the committed migrations and hooks (spec 7.3, 11).

Set POCKETBASE_BIN to the binary; the tests are skipped without it. CI downloads the same
version and checksum as deploy/cms/Dockerfile.
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SUPERUSER = ("admin@example.org", "admin-password-1234567")
BOT = ("bot@example.org", "bot-password-1234567")


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Api:
    def __init__(self, base: str):
        self.base = base

    def call(self, method: str, path: str, body: dict | None = None, token: str | None = None, headers: dict | None = None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        if token:
            req.add_header("Authorization", token)
        for k, v in (headers or {}).items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=10) as res:
                raw = res.read()
                return res.status, (json.loads(raw) if raw else None), dict(res.headers)
        except urllib.error.HTTPError as err:
            raw = err.read()
            return err.code, (json.loads(raw) if raw else None), dict(err.headers)

    def token(self, collection: str, identity: str, password: str) -> str:
        status, body, _ = self.call("POST", f"/api/collections/{collection}/auth-with-password", {"identity": identity, "password": password})
        assert status == 200, body
        return body["token"]


@pytest.fixture(scope="session")
def pb(tmp_path_factory):
    binary = os.environ.get("POCKETBASE_BIN")
    if not binary:
        pytest.skip("POCKETBASE_BIN not set")
    data = tmp_path_factory.mktemp("pb_data")
    args = [f"--dir={data}", f"--migrationsDir={ROOT / 'cms/pb_migrations'}", f"--hooksDir={ROOT / 'cms/pb_hooks'}", "--hooksWatch=false"]
    env = {
        **os.environ,
        "PB_SEED_FILE": str(ROOT / "data/sites.snapshot.json"),
        "PB_BOT_EMAIL": BOT[0],
        "PB_BOT_PASSWORD": BOT[1],
    }
    # same order as deploy/cms/entrypoint.sh
    subprocess.run([binary, "migrate", "up", *args], env=env, check=True, capture_output=True)
    subprocess.run([binary, "superuser", "upsert", *SUPERUSER, *args], env=env, check=True, capture_output=True)
    port = _free_port()
    proc = subprocess.Popen(
        [binary, "serve", f"--http=127.0.0.1:{port}", "--origins=https://grid.example.org", *args],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    api = Api(f"http://127.0.0.1:{port}")
    for _ in range(100):
        try:
            if api.call("GET", "/api/health")[0] == 200:
                break
        except OSError:
            pass
        time.sleep(0.1)
    else:
        proc.kill()
        raise RuntimeError(proc.stdout.read().decode())
    yield api
    proc.terminate()
    proc.wait(timeout=10)


@pytest.fixture(scope="session")
def admin(pb):
    return pb.token("_superusers", *SUPERUSER)


@pytest.fixture(scope="session")
def bot(pb):
    return pb.token("bots", *BOT)
