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
