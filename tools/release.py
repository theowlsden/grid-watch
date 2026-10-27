#!/usr/bin/env python3
"""Cut a release (decision 28) in two steps, like every other change: through a pull request.

  python3 tools/release.py 0.2.0          prepare: a branch release-0.2.0 and its pull request
  python3 tools/release.py --tag 0.2.0    after the pull request is merged: tag main and push

Prepare checks that main is clean and up to date and that CHANGELOG.md has notes under
"Unreleased", then on a new branch sets the version in web/package.json, moves the notes under
the new version with today's date, commits, pushes and opens the pull request. Tag checks that
the merged main has that version and its notes, then pushes an annotated tag; the Release
workflow tests it and moves the `release` branch, which Coolify deploys.
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


class Refused(Exception):
    pass


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip()


def parse(v: str) -> tuple[int, ...]:
    return tuple(int(x) for x in v.split("."))


def on_clean_main(tag: str) -> None:
    if git("branch", "--show-current") != "main":
        raise Refused("switch to main first")
    if git("status", "--porcelain"):
        raise Refused("commit or stash your changes first")
    git("fetch", "--quiet", "--tags", "origin")
    if git("rev-parse", "HEAD") != git("rev-parse", "origin/main"):
        raise Refused("main is not the same as origin/main: git pull first")
    if git("tag", "--list", tag):
        raise Refused(f"{tag} exists already")


def section(text: str, name: str) -> str:
    m = re.search(rf"^## \[{re.escape(name)}\][^\n]*\n(.*?)(?=^## \[|\Z)", text, re.M | re.S)
    return m.group(1).strip() if m else ""


def prepare(version: str) -> None:
    tag = f"v{version}"
    on_clean_main(tag)
    current = json.loads(PACKAGE.read_text())["version"]
    tags = [t for t in git("tag", "--list", "v*.*.*").split() if re.fullmatch(r"v\d+\.\d+\.\d+", t)]
    # the first tagged release may keep the version already in package.json
    if parse(version) < parse(current) or (tags and parse(version) <= max(parse(t[1:]) for t in tags)):
        raise Refused(f"{version} is not newer than {current} or the last tag")
    text = CHANGELOG.read_text()
    notes = section(text, "Unreleased")
    if not notes:
        raise Refused('CHANGELOG.md has nothing under "## [Unreleased]": write the notes first')

    branch = f"release-{version}"
    git("switch", "--quiet", "-c", branch)
    today = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=4)).strftime("%Y-%m-%d")
    m = re.search(r"^## \[Unreleased\]\n.*?(?=^## \[|\Z)", text, re.M | re.S)
    CHANGELOG.write_text(text[: m.start()] + f"## [Unreleased]\n\n## [{version}] - {today}\n\n{notes}\n\n" + text[m.end() :])
    if version != current:
        subprocess.run(["npm", "version", version, "--no-git-tag-version"], cwd=ROOT / "web", check=True, capture_output=True)
    git("add", "CHANGELOG.md", "web/package.json", "web/package-lock.json")
    git("commit", "--quiet", "-m", f"chore(release): {tag}")
    git("push", "--quiet", "-u", "origin", branch)
    try:
        url = subprocess.run(
            ["gh", "pr", "create", "--base", "main", "--head", branch, "--title", f"Release {version}", "--body", notes],
            cwd=ROOT, check=True, capture_output=True, text=True,
        ).stdout.strip()
        print(f"Pull request: {url}")
    except (OSError, subprocess.CalledProcessError):
        print(f"Pushed {branch}; open its pull request on GitHub.")
    git("switch", "--quiet", "main")
    print(f"Once it is merged: git pull, then python3 tools/release.py --tag {version}")


def tag_main(version: str) -> None:
    tag = f"v{version}"
    on_clean_main(tag)
    if json.loads(PACKAGE.read_text())["version"] != version:
        raise Refused(f"web/package.json on main is not {version}: is the release pull request merged and pulled?")
    notes = section(CHANGELOG.read_text(), version)
    if not notes:
        raise Refused(f"CHANGELOG.md has no notes for {version}")
    # verbatim: keep the "### Added" headings, which git would strip as comments
    git("tag", "--annotate", "--cleanup=verbatim", tag, "-m", f"{tag}\n\n{notes}")
    git("push", "--quiet", "origin", tag)
    print(f"Pushed {tag}. The Release workflow tests it and then deploys it.")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("version", help="X.Y.Z, without the v")
    ap.add_argument("--tag", action="store_true", help="tag the merged release on main and push the tag")
    a = ap.parse_args(argv)
    if not re.fullmatch(r"\d+\.\d+\.\d+", a.version):
        print("release: the version is X.Y.Z, e.g. 0.2.0", file=sys.stderr)
        return 1
    try:
        (tag_main if a.tag else prepare)(a.version)
    except Refused as e:
        print(f"release: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
