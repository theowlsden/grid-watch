# Changelog

What changed on the live site, per release. Releases are tagged `vX.Y.Z` and only a tag goes
live (decision 28 in [docs/SPEC.md](docs/SPEC.md); how to release: [deploy/README.md](deploy/README.md#releases)).
Write the notes under **Unreleased** as work lands on `main`, in plain words for visitors.

## [Unreleased]

### Added
- Editors can turn a report from the site into an event or a notice from Telegram (`/reports`,
  `/event 2`, `/notice 2`), fill it in with `/set` and publish it after `/confirm`.

### Changed
- In the bot, how prominent news is moves from `/info`, `/notice` and `/important` to `/level`.

## [0.1.0] - 2026-10-27

### Added
- Report a power cut, load shedding or a utility notice at `/report`, by neighbourhood, without
  a name or contact details. Reports with a source are checked by an editor; reports without one
  are only shown as grouped counts, marked unverified.
- Events and notices from the CMS: "Ongoing" until the end is known, the period with times,
  chips for the scope (island-wide or the neighbourhoods) and the cause. Notices from the
  utility show beside the news and expire on their own.
- The Telegram bot can close an ongoing event (`/ongoing`, `/restored`) and announces new reports.
- A gauge for the stress index on the risk card.
- A first-visit notice: an experiment, not a forecast.

### Fixed
- A report of load shedding past midnight (for example 21:00 to 12:00 the next day) is no
  longer refused: the form has an end date.

### Security
- Next.js 16.4.3 (GHSA-2464-fhr4-w9xw, GHSA-p3m5-59mp-jv5r, GHSA-673q-mjm6-r5xr).

