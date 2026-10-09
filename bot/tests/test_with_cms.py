"""The bot against a real PocketBase with the committed migrations (spec 11): drafts are not
public until /publish is confirmed, and the bot account can only touch news."""

import os
import socket
import subprocess
import sys
import time
import urllib.request
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bot"))

from gridwatch_bot.cms import Cms, CmsError  # noqa: E402
from gridwatch_bot.commands import Bot  # noqa: E402

BOT = ("bot@example.org", "bot-password-1234567")


@pytest.fixture(scope="module")
def base(tmp_path_factory):
    binary = os.environ.get("POCKETBASE_BIN")
    if not binary:
        pytest.skip("POCKETBASE_BIN not set")
    data = tmp_path_factory.mktemp("pb")
    args = [f"--dir={data}", f"--migrationsDir={ROOT / 'cms/pb_migrations'}", f"--hooksDir={ROOT / 'cms/pb_hooks'}", "--hooksWatch=false"]
    env = {**os.environ, "PB_SEED_FILE": str(ROOT / "data/sites.snapshot.json"), "PB_BOT_EMAIL": BOT[0], "PB_BOT_PASSWORD": BOT[1]}
    subprocess.run([binary, "migrate", "up", *args], env=env, check=True, capture_output=True)
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    proc = subprocess.Popen([binary, "serve", f"--http=127.0.0.1:{port}", *args], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    url = f"http://127.0.0.1:{port}"
    for _ in range(100):
        try:
            urllib.request.urlopen(f"{url}/api/health", timeout=1)
            break
        except OSError:
            time.sleep(0.1)
    yield url
    proc.terminate()
    proc.wait(timeout=10)


@pytest.fixture(scope="module")
def cms(base):
    # one signed-in client: sign-ins are rate-limited (2 per 3 s, cms/pb_migrations settings)
    c = Cms(base, *BOT)
    c.token()
    return c


def public_titles(base):
    with urllib.request.urlopen(f"{base}/api/collections/news/records?perPage=100") as r:
        return {i["title_en"] for i in json.loads(r.read())["items"]}


def test_bot_flow_against_pocketbase(base, cms, tmp_path):
    bot = Bot(cms, {1}, tmp_path)
    say = lambda t: bot.handle({"message": {"from": {"id": 1}, "chat": {"id": 1}, "text": t}})[1]  # noqa: E731
    assert "Draft saved" in say("/news Telegram test\nBody text")
    assert "Telegram test" not in public_titles(base), "a draft is not public"
    assert "Telegram test" in say("/show")
    say("/notice")
    assert "/confirm" in say("/publish")
    assert "Telegram test" not in public_titles(base)
    assert "Published" in say("/confirm")
    assert "Telegram test" in public_titles(base)
    rid = cms.list('title_en = "Telegram test"')[0]["id"]
    say(f"/delete {rid}")
    assert say("/confirm") == "Deleted."
    assert "Telegram test" not in public_titles(base)


def test_bot_account_is_limited_to_news(cms):
    for method, path in [("GET", "/api/collections/bots/records"), ("GET", "/api/settings"), ("POST", "/api/collections/sites/records")]:
        with pytest.raises(CmsError) as err:
            cms._call(method, path, {} if method == "POST" else None)
        assert err.value.status in (400, 401, 403, 404)


def test_wrong_password_is_reported(base):
    time.sleep(3.2)  # let the sign-in rate limit window pass
    with pytest.raises(CmsError) as err:
        Cms(base, BOT[0], "wrong-password-123456").token()
    assert err.value.status == 400
