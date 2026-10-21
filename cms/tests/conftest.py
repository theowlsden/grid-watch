"""Session fixtures for the CMS tests; helpers live in pb_helpers.py (a unique module name, so
running these tests together with bot/tests cannot pick up the wrong conftest)."""

import os
import subprocess
import time

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs

import pytest

from pb_helpers import BOT, ROOT, SUPERUSER, Api, _free_port


class _Turnstile(BaseHTTPRequestHandler):
    """Stand-in for Cloudflare's siteverify: only the token "good-token" passes."""

    def do_POST(self):  # noqa: N802
        form = parse_qs(self.rfile.read(int(self.headers.get("content-length", 0))).decode())
        ok = form.get("secret") == ["test-secret"] and form.get("response") == ["good-token"]
        body = json.dumps({"success": ok}).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


@pytest.fixture(scope="session")
def turnstile():
    server = HTTPServer(("127.0.0.1", 0), _Turnstile)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}/verify"
    server.shutdown()


@pytest.fixture(scope="session")
def pb(tmp_path_factory, turnstile):
    binary = os.environ.get("POCKETBASE_BIN")
    if not binary:
        pytest.skip("POCKETBASE_BIN not set")
    data = tmp_path_factory.mktemp("pb_data")
    args = [f"--dir={data}", f"--migrationsDir={ROOT / 'cms/pb_migrations'}", f"--hooksDir={ROOT / 'cms/pb_hooks'}", "--hooksWatch=false"]
    env = {
        **os.environ,
        "PB_SEED_FILE": str(ROOT / "data/sites.snapshot.json"),
        "PB_I18N_DIR": str(ROOT / "web/src/i18n"),
        "PB_NEIGHBOURHOODS": str(ROOT / "data/neighbourhoods.json"),
        "TURNSTILE_SECRET": "test-secret",
        "TURNSTILE_VERIFY_URL": turnstile,
        "PB_BOT_EMAIL": BOT[0],
        "PB_BOT_PASSWORD": BOT[1],
    }
    # same order as deploy/cms/entrypoint.sh
    subprocess.run([binary, "migrate", "up", *args], env=env, check=True, capture_output=True)
    subprocess.run([binary, "superuser", "upsert", *SUPERUSER, *args], env=env, check=True, capture_output=True)
    port = _free_port()
    # the log goes to a file: an unread pipe fills up after ~64 KB and then blocks the server
    log = open(data / "serve.log", "w")
    proc = subprocess.Popen(
        [binary, "serve", f"--http=127.0.0.1:{port}", "--origins=https://grid.example.org", *args],
        env=env,
        stdout=log,
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
        raise RuntimeError((data / "serve.log").read_text())
    yield api
    proc.terminate()
    proc.wait(timeout=10)


@pytest.fixture(scope="session")
def admin(pb):
    return pb.token("_superusers", *SUPERUSER)


@pytest.fixture(scope="session")
def bot(pb):
    return pb.token("bots", *BOT)
