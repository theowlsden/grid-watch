"""Build web/public/data/events.json from data/events/events.yaml.

    python pipeline/tools/build_events.py          # write events.json
    python pipeline/tools/build_events.py --check  # exit 1 if events.json is out of date
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from events import build_events, dumps, load_events_yaml  # noqa: E402
from paths import EVENTS_JSON, EVENTS_YAML  # noqa: E402
from validate import Report, check_events  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--check", action="store_true", help="only check that the output is up to date")
    p.add_argument("--yaml", type=Path, default=EVENTS_YAML)
    p.add_argument("--out", type=Path, default=EVENTS_JSON)
    args = p.parse_args(argv)

    events = build_events(load_events_yaml(args.yaml))
    report = Report()
    check_events(events, report, strict=False)
    for e in report.errors:
        print(f"ERROR    {e}")
    if not report.ok:
        print("events.yaml is invalid; nothing written")
        return 1

    text = dumps(events)
    if args.check:
        current = args.out.read_text(encoding="utf-8") if args.out.exists() else ""
        if current != text:
            print(f"{args.out} is out of date; run python pipeline/tools/build_events.py")
            return 1
        print(f"{args.out} is up to date ({len(events)} events)")
        return 0
    args.out.write_text(text, encoding="utf-8")
    print(f"wrote {args.out} ({len(events)} events)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
