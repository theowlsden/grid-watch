#!/usr/bin/env python3
"""Cut a release (decision 28): python3 tools/release.py 0.2.0 [--push]

Checks that main is clean and up to date and that CHANGELOG.md has notes under "Unreleased",
then sets the version in web/package.json, moves the notes under the new version with today's
date, commits and makes an annotated tag. With --push, main and the tag are pushed together;
the Release workflow then tests the tag and moves the `release` branch, which Coolify deploys.
"""

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHANGELOG = ROOT / "CHANGELOG.md"
PACKAGE = ROOT / "web" / "package.json"


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip()


def fail(why: str) -> int:
    print(f"release: {why}", file=sys.stderr)
    return 1


def parse(v: str) -> tuple[int, ...]:
    return tuple(int(x) for x in v.split("."))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("version", help="X.Y.Z, without the v")
    ap.add_argument("--push", action="store_true", help="push main and the tag (starts the release)")
    a = ap.parse_args(argv)
    if not re.fullmatch(r"\d+\.\d+\.\d+", a.version):
        return fail("the version is X.Y.Z, e.g. 0.2.0")
    tag = f"v{a.version}"

    if git("branch", "--show-current") != "main":
        return fail("switch to main first")
    if git("status", "--porcelain"):
        return fail("commit or stash your changes first")
    git("fetch", "--quiet", "--tags", "origin")
    if git("rev-parse", "HEAD") != git("rev-parse", "origin/main"):
        return fail("main is not the same as origin/main: pull or push first")
    if tag in git("tag", "--list", tag).split():
        return fail(f"{tag} exists already")

    current = json.loads(PACKAGE.read_text())["version"]
    tags = [t for t in git("tag", "--list", "v*.*.*").split() if re.fullmatch(r"v\d+\.\d+\.\d+", t)]
    # the first tagged release may keep the version already in package.json
    if parse(a.version) < parse(current) or (tags and parse(a.version) <= max(parse(t[1:]) for t in tags)):
        return fail(f"{a.version} is not newer than {current} or the last tag")

    text = CHANGELOG.read_text()
    m = re.search(r"^## \[Unreleased\]\n(.*?)(?=^## \[|\Z)", text, re.M | re.S)
    if not m or not m.group(1).strip():
        return fail('CHANGELOG.md has nothing under "## [Unreleased]": write the notes first')
    notes = m.group(1).strip()
    today = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=4)).strftime("%Y-%m-%d")
    CHANGELOG.write_text(text[: m.start()] + f"## [Unreleased]\n\n## [{a.version}] - {today}\n\n{notes}\n\n" + text[m.end() :])

    if a.version != current:
        subprocess.run(["npm", "version", a.version, "--no-git-tag-version"], cwd=ROOT / "web", check=True, capture_output=True)
    git("add", "CHANGELOG.md", "web/package.json", "web/package-lock.json")
    git("commit", "--quiet", "-m", f"chore(release): {tag}")
    git("tag", "--annotate", "--cleanup=verbatim", tag, "-m", f"{tag}\n\n{notes}")
    print(f"Tagged {tag}.")
    if a.push:
        git("push", "--atomic", "origin", "main", tag)
        print("Pushed. The Release workflow tests it and then deploys it.")
    else:
        print(f"Check it, then: git push --atomic origin main {tag}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
