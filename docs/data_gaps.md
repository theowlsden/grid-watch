# Data gaps

What public data cannot show, and therefore what this project cannot know:

- Which generating units are in service or in maintenance at any moment (generator availability).
- Real electricity demand (system load); the project uses a weather-based proxy.
- Battery state of charge.
- Measured wind output per park; wind output is estimated from forecast wind with a generic power curve and shown as one island-wide figure.
- A complete record of outages and load shedding, with end times, areas and cause; events are collected by hand from news and utility posts, and community reports (decision 26) help find them.

The site page `/data` (decision 27, text in `web/src/i18n/en.json` under `data.`) turns these gaps
into a minimal set of data that would make the outlook testable, and how it could be shared. See
[SPEC.md](SPEC.md) sections 1 and 5.
