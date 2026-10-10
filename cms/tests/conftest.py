"""Session fixtures for the CMS tests; helpers live in pb_helpers.py (a unique module name, so
running these tests together with bot/tests cannot pick up the wrong conftest)."""

import os
import subprocess
import time

import pytest

from pb_helpers import BOT, ROOT, SUPERUSER, Api, _free_port


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
        "PB_I18N_DIR": str(ROOT / "web/src/i18n"),
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
