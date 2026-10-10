"""Papiamentu interface text in the CMS (spec 4.7): synced from en.json on start, edited and
published by editors, read publicly only when published."""

import contextlib
import json
import os
import subprocess
import time

import pytest

from pb_helpers import ROOT, SUPERUSER, Api, _free_port

EN = json.loads((ROOT / "web/src/i18n/en.json").read_text())
URL = "/api/collections/translations/records"


def row(pb, admin, key):
    _, body, _ = pb.call("GET", f"{URL}?filter=(key='{key}')", token=admin)
    assert body["items"], key
    return body["items"][0]


def public_keys(pb):
    status, body, _ = pb.call("GET", f"{URL}?perPage=500")
    assert status == 200
    return {i["key"]: i["pap"] for i in body["items"]}


# ---------- against the shared CMS (synced from the real en.json) ----------


def test_every_english_key_has_a_row(pb, admin):
    _, body, _ = pb.call("GET", f"{URL}?perPage=500", token=admin)
    rows = {i["key"]: i for i in body["items"]}
    assert set(EN) <= set(rows)
    assert all(rows[k]["en"] == EN[k] for k in EN)


def test_only_published_text_is_public(pb, admin):
    r = row(pb, admin, "level.low")
    status, body, _ = pb.call("PATCH", f"{URL}/{r['id']}", {"pap": "pap low", "status": "draft"}, token=admin)
    assert status == 200, body
    assert "level.low" not in public_keys(pb)
    status, body, _ = pb.call("PATCH", f"{URL}/{r['id']}", {"status": "published"}, token=admin)
    assert status == 200, body
    assert public_keys(pb)["level.low"] == "pap low"
    assert body["updatedBy"] == "admin@example.org"


def test_publishing_needs_text(pb, admin):
    r = row(pb, admin, "level.high")
    status, body, _ = pb.call("PATCH", f"{URL}/{r['id']}", {"pap": "", "status": "published"}, token=admin)
    assert status == 400, body


def test_placeholders_must_match(pb, admin):
    key = next(k for k, v in EN.items() if "{" in v)
    r = row(pb, admin, key)
    status, body, _ = pb.call("PATCH", f"{URL}/{r['id']}", {"pap": "no placeholder"}, token=admin)
    assert status == 400 and "placeholders" in json.dumps(body), body


def test_date_lists_need_the_right_length(pb, admin):
    r = row(pb, admin, "date.daysShort")
    status, body, _ = pb.call("PATCH", f"{URL}/{r['id']}", {"pap": "a,b,c"}, token=admin)
    assert status == 400, body
    status, body, _ = pb.call("PATCH", f"{URL}/{r['id']}", {"pap": "1,2,3,4,5,6,7"}, token=admin)
    assert status == 200, body


def test_key_and_english_are_not_editable(pb, admin):
    r = row(pb, admin, "level.moderate")
    status, body, _ = pb.call("PATCH", f"{URL}/{r['id']}", {"key": "level.renamed", "en": "Changed", "pap": "pap moderate"}, token=admin)
    assert status == 200, body
    assert body["key"] == "level.moderate" and body["en"] == EN["level.moderate"] and body["pap"] == "pap moderate"


def test_keys_cannot_be_added_by_hand(pb, admin):
    status, body, _ = pb.call("POST", URL, {"key": "made.up", "pap": "x", "status": "draft"}, token=admin)
    assert status == 400, body


def test_public_and_bot_cannot_write(pb, admin, bot):
    r = row(pb, admin, "level.elevated")
    before = public_keys(pb).get("level.elevated")
    for token in (None, bot):
        status, _, _ = pb.call("PATCH", f"{URL}/{r['id']}", {"pap": "x", "status": "published"}, token=token)
        assert status in (400, 401, 403, 404)
    # unchanged, whether or not the bundled pap.json had published it
    assert public_keys(pb).get("level.elevated") == before
    assert row(pb, admin, "level.elevated")["pap"] == r["pap"]


def test_public_reads_are_cacheable(pb):
    _, _, headers = pb.call("GET", f"{URL}?perPage=1")
    assert headers.get("Cache-Control") == "public, max-age=60"


# ---------- sync across restarts, with a small en.json of its own ----------


@contextlib.contextmanager
def serve(binary, data, i18n):
    env = {**os.environ, "PB_I18N_DIR": str(i18n)}
    args = [f"--dir={data}", f"--migrationsDir={ROOT / 'cms/pb_migrations'}", f"--hooksDir={ROOT / 'cms/pb_hooks'}", "--hooksWatch=false"]
    subprocess.run([binary, "migrate", "up", *args], env=env, check=True, capture_output=True)
    subprocess.run([binary, "superuser", "upsert", *SUPERUSER, *args], env=env, check=True, capture_output=True)
    port = _free_port()
    proc = subprocess.Popen([binary, "serve", f"--http=127.0.0.1:{port}", *args], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    api = Api(f"http://127.0.0.1:{port}")
    try:
        for _ in range(100):
            try:
                if api.call("GET", "/api/health")[0] == 200:
                    break
            except OSError:
                time.sleep(0.1)
        yield api, api.token("_superusers", *SUPERUSER)
    finally:
        proc.terminate()
        proc.wait(timeout=10)


def write(i18n, en, pap):
    (i18n / "en.json").write_text(json.dumps(en))
    (i18n / "pap.json").write_text(json.dumps(pap))


def test_sync_adds_flags_and_retires_keys(tmp_path):
    binary = os.environ.get("POCKETBASE_BIN")
    if not binary:
        pytest.skip("POCKETBASE_BIN not set")
    data, i18n = tmp_path / "pb_data", tmp_path / "i18n"
    i18n.mkdir()

    # first start: one key prefilled from pap.json (published), one empty (draft)
    write(i18n, {"a": "Updated {time}", "b": "Low"}, {"a": "pap a {time}"})
    with serve(binary, data, i18n) as (api, admin):
        a, b = row(api, admin, "a"), row(api, admin, "b")
        assert (a["status"], a["pap"]) == ("published", "pap a {time}")
        assert (b["status"], b["pap"]) == ("draft", "")
        api.call("PATCH", f"{URL}/{b['id']}", {"pap": "pap low", "status": "published"}, token=admin)

    # the English of "a" changes and "c" is new: "a" is flagged, the edit to "b" survives
    write(i18n, {"a": "Last updated {time}", "b": "Low", "c": "New"}, {})
    with serve(binary, data, i18n) as (api, admin):
        a = row(api, admin, "a")
        assert a["en"] == "Last updated {time}" and a["needs_review"] and a["pap"] == "pap a {time}"
        assert row(api, admin, "b")["pap"] == "pap low"
        assert row(api, admin, "c")["status"] == "draft"
        # saving the translation clears the flag
        _, body, _ = api.call("PATCH", f"{URL}/{a['id']}", {"pap": "pap a2 {time}"}, token=admin)
        assert body["needs_review"] is False

    # pap.json fills empty rows only: "c" is filled and published, "a" keeps the CMS text,
    # and a fill that breaks the placeholders is skipped
    write(i18n, {"a": "Last updated {time}", "b": "Low", "c": "New", "d": "At {time}"}, {"a": "from file {time}", "c": "pap new", "d": "no placeholder"})
    with serve(binary, data, i18n) as (api, admin):
        c = row(api, admin, "c")
        assert (c["pap"], c["status"], c["updatedBy"]) == ("pap new", "published", "pap.json")
        assert row(api, admin, "a")["pap"] == "pap a2 {time}"
        assert row(api, admin, "d")["pap"] == ""
        # once a row has text in the CMS, pap.json no longer touches it
        api.call("PATCH", f"{URL}/{c['id']}", {"pap": "edited in cms"}, token=admin)
    write(i18n, {"a": "Last updated {time}", "b": "Low", "c": "New"}, {"c": "pap new"})
    with serve(binary, data, i18n) as (api, admin):
        assert row(api, admin, "c")["pap"] == "edited in cms"

    # "b" is no longer used: hidden from the public, text kept
    write(i18n, {"a": "Last updated {time}", "c": "New"}, {})
    with serve(binary, data, i18n) as (api, admin):
        b = row(api, admin, "b")
        assert b["obsolete"] and b["pap"] == "pap low"
        assert "b" not in public_keys(api)
        assert "a" in public_keys(api)
