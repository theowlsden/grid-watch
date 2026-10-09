# Grid Watch Curaçao: Requirements Spec

Status: draft 1, written 7 Oct 2026 after the first prototype round.
Audience: Claude Code (and Chaco) continuing the build from the HTML prototype.
Working name: **Grid Watch Curaçao**. Alternatives still open: Kilowhat, Koriente (correct Papiamentu spelling per Chaco). **Decided: the product sits under the parent brand Noir Visuals and is credited as "Grid Watch by Noir Visuals"** (the Noir Visuals site does not exist yet, so the credit is plain text until it does; link it when it is live).

---

## 1. Purpose and positioning

A public dashboard where residents can see, in plain language and on a 3D model of the island, how likely it is that Curaçao's electricity supply will be under stress in the coming seven days. Background: demand for electricity and water has grown a lot since 2020, wind is the biggest swing factor, and generation units are often unavailable, so controlled outages (load switching) keep recurring.

The framing matters for credibility and must be kept everywhere (UI copy, README, LinkedIn post, code comments):

| Say | Never say |
|---|---|
| "Estimates electricity supply stress from public data" | "Predicts blackouts" |
| "Experimental research prototype, not an operational utility forecast" | "Predicts Aqualectra outages" |
| "Explores how much warning public data can give" | "Knows when load shedding will happen" |
| "Probability of elevated supply stress" (only once calibrated) | "Accurately forecasts the Curaçao grid" |

Core research question (north star): how accurately can electricity supply stress in Curaçao be forecast 1 to 7 days ahead using only public data? The data gaps are part of the message: public data cannot show generator availability, real load or battery state, and the product should say so on screen.

Secondary goal: a conversation starter with Aqualectra, the Meteorological Department of Curaçao (MDC) and the Regulatory Authority of Curaçao (RAC), ideally leading to anonymised hourly system load and wind generation data.

## 2. Current state (baseline)

Deliverable so far: one self-contained HTML file, `grid-watch-prototype.html` (keep it in `docs/prototype/` as the visual and behavioural reference).

- Stack: vanilla JS, three.js r128 from cdnjs, Google Fonts (Baloo 2, Nunito). No build step.
- All numbers are **example data** made up for the prototype (7-day risk percentages, wind speeds, temperatures). They must never ship as if real. The UI carries an "Example data, not a live forecast" tag for this reason.
- Real figures already in the prototype (from public reports in the research doc): island wind fleet 69 MW (2024), conventional fleet 151 MW (2024), registered PV 16.6 MW (2024), and the five reported events in section 8.4.
- Site positions and the island outline are stylised, not geographic.

Known gaps in the prototype:

1. Mobile layout needs a re-check (see 4.2). The mobile CSS and JS in the latest uploaded file are identical to the last published version, so any regression is in rendering behaviour, not an obvious code change. Verify on real devices and with screenshots before changing anything.
2. The legend says Normal / Watch / Strained / Critical, while the readout says Low / Moderate / Elevated / High. Decided: use Low / Moderate / Elevated / High everywhere (see 12).
3. No live data, no tests, no fallback when WebGL is unavailable beyond a one-line message.
4. Event entries have no source links yet.

## 3. Scope and phases

| Phase | Outcome | Notes |
|---|---|---|
| 0 | Prototype (done) | Look, layout, interactions, example data |
| 1 | Productionise the front end | Real project, typed data contract, tests, deployed with **example** data |
| 2 | Live weather + transparent rule-based stress outlook | Daily pipeline, "stress outlook" wording, no probability claims |
| 3 | Event database, backtest, calibration | Sourced events, hindcast and forecast backtests, then a calibrated probability |
| 4 | Prospective validation | Run daily, log every forecast immutably for 30 to 90+ days, publish the scorecard |
| 5 | Utility and MDC collaboration | Anonymised load and generation data, better model, possible pilot |

Out of scope for now: other islands (Aruba, Bonaire), user accounts, push notifications, per-neighbourhood outage prediction, any claim about individual outages. Solve Curaçao deeply first.

## 4. Experience requirements

### 4.1 Wide desktop (viewport over 1500 px wide and at least 1182 px tall)

- **Left column (about 424 px wide)**: main information only.
  1. Brand card: "Example data" tag (until live), Auto/Day/Night control, large title "Grid Watch Curaçao", one-line description.
  2. Risk card: mascot, date and window ("Wed 7 Oct 2026, 19:00 to 22:00"), large percentage, level pill, one-line explanation.
  3. Stat tiles stacked: wind at hub height, evening heat with demand level, generator capacity ("Unknown, not public").
  The column scrolls inside itself if the viewport is short.
- **Right area**: the 3D island with site labels, a pop-up info card, a compass, a "Drag to rotate, scroll to zoom" hint.
- **Bottom row, full page width** (about 284 px tall): "Next 7 days" chart on the left (about 40 percent), reported events on the right (about 60 percent) as horizontally scrolling cards. The status legend lives in the chart card header.
- The seven-day chart is also the day picker. Selecting a day updates the risk card, stat tiles, site status, tile colours, mascot and island tint.

### 4.2 Everything else: phones, tablets, laptops and shorter desktop windows

**Decided (12.12):** the side column and bottom row of 4.1 are only used when the viewport is over 1500 px wide **and** at least 1182 px tall; they are too cluttered on tablets, laptops and shorter desktop screens (for example 1920x1080). Everywhere else:

- **Portrait** (and near-square windows): the stacked layout below.
- **Landscape** (aspect ratio 5:4 or wider, phones to desktops under 1182 px tall): risk card on the left (about 300 to 400 px), island on the right, seven-day strip along the bottom. Stat tiles and the large chart are not shown. The risk card must fit without scrolling, also on a landscape phone. An open site card replaces the risk card in the left column, so the island stays fully visible.
- **Top bar** (both orientations): one container with the app name, the "Reported events" button and the Auto/Day/Night control (and later EN / PAP). The app name is not repeated in the risk card. One row where it fits, otherwise the name above the controls.
- **No site labels on screen** (they cluttered the view): sites are opened by tapping their tile on the island, with a short hint "Tap a site on the island for details" until the first tap. The label buttons stay in the page, visually hidden, for keyboard and screen-reader users; a focused one becomes visible and lifts its tile.
- In portrait the island is centred in its row; while a site card is open the view shifts so the island centres in the space above the card.

Stacked layout:

- Risk card at the top (title, mascot, percentage, level, driver chips), island below it, seven-day strip pinned to the bottom. Reported events open in a panel from a button at the top left. The Auto/Day/Night control sits top right.
- **Requirement**: the island must be fully visible in the space between the risk card and the day strip. Do this with layout, not by letting the card cover the canvas. Preferred implementation: the canvas area is a flex or grid row between the card and the strip, or the camera view is offset so the island centres in the free area. The site info card is a bottom sheet (max about 54 percent of the height) above the strip and must not hide the island entirely when open.
- Safe-area insets respected (notch, home indicator). No horizontal page scroll. Minimum side gutter 16 px.
- Test sizes: 360x740, 390x844, 430x932, 768x1024 (stacked); 667x375, 844x390, 1024x768, 1280x800, 1500x900, 1920x1080, 1600x1181 (landscape, card left); 1600x1182, 1920x1200 (wide desktop).

### 4.3 Day and night

- Default mode **Auto**: follow the viewer's local clock, day from 06:00 to 18:00, night otherwise. Re-evaluate every 60 seconds.
- Control with three options (Auto, Day, Night). The choice is stored in `localStorage` under `gridwatch-mode` (wrap in try/catch, work without it).
- Day: pale blue ground, white panels, lime island. Night: deep navy ground, dark glass panels, moonlit island, stars, glowing status tiles, lit windows on the power plant. **Decided: solar and battery are out of scope for v1, so there is no sun, solar marker or battery in the scene in either mode** (the prototype's solar sun and battery model are removed). Transition is animated (about 1 s), not a hard switch.
- Mode changes appearance only, never data.

### 4.4 The 3D island

- Style reference: soft toy/clay diorama. Floating thick disc with a brown rim and lime top, rounded glossy assets, soft shadow beneath, gentle bob. Inspirations: the succulent app screen (pale blue ground, round character), the green isometric path tiles, the dark Bonaire terrain screen (left info, right island).
- Four sites (three wind locations and Dokweg), each on a glossy rounded **status tile** whose colour is the site status (green, yellow, orange, red, or blue-grey where data is not public):
  - Wind: **four parks at three locations**: Tera Kora (two parks), Playa Kanoa (one) and Koraal Tabak (one). Three wind markers (`terakora`, `playakanoa`, `koraaltabak`), three white turbines per marker in the prototype style (Tera Kora shows two clusters or a larger one), yellow hubs, rotor speed scales with wind. The card lists the parks at that location; output stays an island-wide figure (12.6).
  - Dokweg power plant: cream building, coral roof, striped chimneys, animated smoke.
  - Not in v1: solar and battery storage (no confirmed public location or data; the evening peak is after sunset, so solar adds little to the evening outlook). They can be added later as normal `sites` records with a model node (7.4), and the prototype code for both is kept in `docs/prototype/` for reference.
- Interaction: drag to orbit, wheel and pinch to zoom, tap a site label to select (tile lifts, card opens, dashed leader line on desktop), tap again or press Esc to close. Site labels are real `<button>`s.
- Compass rotates with the camera. Camera polar angle limited to roughly 0.3 to 1.4 rad, zoom limited.
- Mascot ("Watt"): green sprout-blob in a dark circle, expression follows the risk level (happy, content, uneasy, worried). It is decoration; it must never be the only carrier of meaning.
- `prefers-reduced-motion`: no bobbing, spinning, smoke or idle animation.
- Fallback when WebGL fails: a 2D list/diagram of the same four sites with the same statuses and cards (currently only a text message, improve in Phase 1).

### 4.5 Site info cards

Structure: icon and kind, name, status pill, optional progress row (wind: estimated output), two tiles, note. Content per site kind is in `docs/prototype` (`renderCard`). Rules:

- Anything estimated says "estimated" and how (for wind: generic power curve applied to forecast wind, cut-in 3 m/s, rated about 12 m/s, cubic).
- Anything only the utility knows says "not public" instead of showing a guess.
- Fleet figures carry their year ("2024") and source.

### 4.6 Reported events

- Desktop: horizontally scrolling cards in the bottom row. Mobile: panel opened from "Reported events".
- Two severities: major (blackout, major outage) and minor (controlled switching, shortage, controlled outages).
- **Every event must show a source link** (publisher, title, date). The prototype does not have these yet; this is a Phase 1 blocker for publishing.
- Footnote always visible: what the page cannot show (generators in service, real demand, battery charge).

### 4.7 Language

**Decided: English by default, with a visible EN / PAP toggle (Papiamentu).** Dutch is out of scope for launch; keep the i18n structure so `nl.json` can be added later without code changes. Use message keys from the start (no hard-coded strings in components). The choice is stored in `localStorage` (`gridwatch-lang`) and the first visit defaults to English. The toggle sits next to the Auto/Day/Night control. Papiamentu copy must be reviewed by a native speaker before launch, and untranslated keys fall back to English rather than showing a key name. Risk level names (Low, Moderate, Elevated, High) and all disclaimers need Papiamentu versions. Event titles and source names stay in their original language. Dates and times use the `America/Curacao` zone (UTC-4, no daylight saving).

### 4.8 Accessibility

- Contrast AA in both modes. Status is never colour-only: always paired with a word or icon.
- Everything operable by keyboard: site buttons, day picker (arrow keys between days), Auto/Day/Night, events, close card with Esc. Visible focus.
- `aria-pressed` on toggles, readable `aria-label`s on day buttons (e.g. "Saturday 10 October, 67 percent, High").
- The canvas is decorative: all information is also available in text (cards, chart, lists).
- Respect reduced motion; no flashing.

## 5. Risk model requirements

### 5.1 What the number means

- Phases 1 and 2: show a **stress outlook level** (Low, Moderate, Elevated, High) and a 0 to 100 **stress index** from transparent rules. Do **not** label it a probability or "chance".
- From Phase 3, once calibrated against the event database: show "probability of elevated supply stress" with confidence and a visible calibration caveat (few documented events).
- The prototype wording "Chance of elevated grid stress" and the percentages are placeholders; change the label with the data mode.
- Level thresholds used in the prototype (keep unless calibration says otherwise): under 25 Low, 25 to 44 Moderate, 45 to 59 Elevated, 60 and up High.
- Forecast window: **evening peak, 19:00 to 22:00 local** (assumption from the prototype and from reports citing evening demand; verify against the event timestamps).
- Always show a confidence label and the dominant drivers, plus "Generator availability: unknown".

### 5.2 Rule-based v0 (Phase 2)

For each day D in the next seven, using the forecast issued at time T (never later information):

1. Take hourly forecast wind at about 100 m, 2 m temperature and humidity for the window.
2. `windOutputFrac` = generic turbine power curve (cut-in 3 m/s, rated about 12 m/s, cubic between). Label as estimated.
3. Demand proxy from temperature/heat index (higher heat, higher evening demand), plus calendar effects later (holidays, tourism).
4. Stress index = weighted combination of low wind output and high demand proxy. Weights and thresholds are **configuration**, committed in a file, and later fitted against events. The index must be reproducible from the stored inputs.
5. Confidence from forecast horizon and, if available, ensemble spread.
6. Per-site status: wind locations from estimated output tone (very low wind is high-coloured), Dokweg (conventional generation) always "not public". Solar and battery are not modelled in v1.

Weather alone cannot explain every event (the April 2026 outage was mostly maintenance and battery reliance). The UI must say that capacity is unknown instead of implying the weather score covers it.

### 5.3 Event-based evaluation (Phase 3)

- Build the public event database (section 8.4). Every row sourced.
- Separate three problems: (A) weather and renewable forecast error by horizon (MAE, RMSE, bias at +6 to +168 h), (B) demand proxy (anchored on annual and monthly public totals, no invented hourly truth), (C) stress-event detection.
- Baselines to beat: seasonal average (month, hour, weekday), persistence, weather-only. Then the fuller model.
- Rolling-origin time-series backtests only; no random splits. No leakage: at issue time T use only data available at T.
- ERA5 is reanalysis, not an archived forecast. Label ERA5 experiments as "historical weather modelling" and do not present them as a true seven-day forecast backtest. Archived forecasts (for example from the weather API's historical forecast archive, or the project's own stored issuances) are the stronger test.
- Report precision, recall, false-positive rate and lead time at thresholds 30 to 80 percent, plus Brier score and calibration curve with an explicit small-sample warning.
- Case studies for 27 Aug 2025, Apr 2026, Aug 2026, 6 Oct 2026: "what would the model have known at T-7 d, T-72 h, T-24 h, T-6 h, T-1 h". Wording: "in a retrospective experiment the model would have indicated X", never "the AI predicted the blackout".

### 5.4 Prospective validation (Phase 4)

- Run daily on a schedule, store every issuance immutably (append-only, timestamped, model version included). Do not change rules based on outcomes during the validation window.
- Record outcomes against the event database. Publish a scorecard (forecasts issued, events, detected, median warning time, false alarms, Brier score) only from real runs.

## 6. Data sources

| Source | Use | Notes |
|---|---|---|
| MDC (Meteorological Department of Curaçao) | Local observations and forecasts, ideal partner | Contact early; start with global data |
| Open-Meteo (forecast, historical forecast archive, ensemble) | **Decided: Phase 2 weather provider, behind a swappable source module (decision 18)** | Free API is for non-commercial use with attribution (CC BY 4.0). If Grid Watch ends up under the consultancy brand or carries sponsorship, use a paid plan or self-host. Call it from the pipeline only (once per day, cached), never from the browser. Store the model name and run time with every pull so forecasts can be replayed |
| NOAA GFS (AWS Open Data, every run since 2021) | Second weather source; archived forecasts for Phase 3 backtests | CC BY 4.0, commercial use allowed; GRIB2, 80 m and 100 m wind. Planned |
| ECMWF open data (IFS 0.25°) | Optional second model | CC BY 4.0, commercial use allowed with credit; `100u`/`100v` available; only recent runs online. Planned |
| ERA5 | Historical relationships, power curve calibration | Reanalysis, not forecasts |
| NASA POWER | Reproducible historical weather and solar | Backup/cross-check |
| Global Wind Atlas | Static wind resource layer for the island | Not a forecast source |
| CBS Curaçao and government statistics | Annual and monthly electricity production and sales | Calibration anchors |
| Aqualectra annual reports (2012 to 2025) | Sales, production, renewable share, capacity | e.g. sales about 735,778 MWh in 2024 vs about 655,263 MWh in 2023; production about 866,950 MWh in 2022 |
| RAC energy reports | Capacity, renewable penetration | 2024: about 69 MW wind, 151 MW conventional, about 16.6 MW PV; wind about 21 percent of production; renewables about 40 percent in the first five months of 2026. Treat as year-specific |
| Aqualectra / DNV investigation (27 Aug 2025) | Case study | Wind output dropped around 02:30 |
| Electricity Maps | Visual comparison only | Curaçao data is marked synthetic; never ground truth |

Every source shown in the UI or README needs attribution and a retrieval date. Respect each licence.

## 7. Architecture (proposed)

Chaco's stack and hosting habits (Next.js, Python tooling, Docker on a Hostinger VPS managed with Coolify) set the defaults. Keep v1 boring: static front end, daily pipeline that writes JSON, no database.

```
grid-watch/
  web/                  Next.js (App Router) + TypeScript, static export
    src/components/     RiskCard, StatTiles, WeekChart, EventsCarousel, SiteCard, ModeSwitch, Mascot
    src/scene/          three.js scene (island, sites, lighting, camera, day/night)
    src/i18n/           en.json, nl.json, pap.json
    src/lib/            levels.ts, mode.ts, time.ts, schema.ts
  pipeline/             Python
    fetch_weather.py    forecast + archives
    power_curve.py
    stress.py           rule-based index (config in stress_config.yaml)
    backtest/           evaluation, baselines, calibration
    publish.py          writes public/data/*.json
  data/
    events/events.yaml  sourced event database
    sites.snapshot.json committed export of the CMS `sites` and `island` records (build fallback and pipeline input; see 7.4)
  LICENSE, DATA_LICENSES.md, TRADEMARKS.md, CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md   (see 12b)
  assets/               source models (.blend, .nsc) and artwork, with its own LICENSE
  docs/
    SPEC.md
    prototype/grid-watch-prototype.html
    methodology.md, data_gaps.md, results.md
  cms/                  PocketBase (news collection only): pb_migrations/, pb_hooks/, Dockerfile, pb_data/ (volume, git-ignored)
  bot/                  Telegram news bot (Python), own Dockerfile (Phase 1b)
  deploy/               Dockerfiles, docker-compose.yaml for Coolify (web, cms, bot, pipeline), static-server config with security headers, backup notes
```

Decisions to confirm (recommendation in bold):

- three.js directly (**recommended**, the scene is already written that way) vs react-three-fiber.
- Static export served by a tiny static web container (Caddy or nginx image) behind Coolify's proxy (**recommended**) vs server rendering.
- Pipeline scheduling: host cron/systemd timer (**recommended**) vs CI scheduled job that commits data.
- Pin three.js to an exact version and bundle it (no runtime CDN). Self-host fonts or keep Google Fonts (privacy trade-off, see 9).

### 7.1 Data contracts (JSON, served from `/data`)

`forecast.json`
```json
{
  "issued_at": "2026-10-07T12:00:00Z",
  "timezone": "America/Curacao",
  "data_mode": "example | live",
  "model": { "name": "rules-v0", "version": "0.1.0", "label": "Stress outlook" },
  "window_local": { "start": "19:00", "end": "22:00" },
  "days": [
    {
      "date": "2026-10-07",
      "index": 18,
      "level": "low | moderate | elevated | high",
      "confidence": "low | medium | high",
      "drivers": {
        "wind_ms_100m": 11.2,
        "wind_output_pct_est": 76,
        "temp_c": 31,
        "demand": "normal | raised | high",
        "capacity": "unknown"
      },
      "sites": {
        "playakanoa": { "status": "low | moderate | elevated | high | unknown", "est_output_pct": 76 },
        "terakora": { "status": "...", "est_output_pct": 76 },
        "koraaltabak": { "status": "...", "est_output_pct": 76 }
      }
    }
  ],
  "sources": [{ "name": "", "url": "", "retrieved_at": "" }],
  "limitations": ["Generator availability is not public", "Demand is a weather-based proxy"]
}
```

`events.json` (built from `data/events/events.yaml`)
```json
[
  {
    "id": "2025-08-27-blackout",
    "start_local": "2025-08-27T02:30:00-04:00",
    "end_local": null,
    "type": "blackout | outage | controlled_switching | shortage | warning",
    "severity": "major | minor",
    "drivers": ["wind_drop", "heat", "high_demand", "maintenance", "capacity_shortfall", "battery_reliance"],
    "summary": "",
    "sources": [{ "publisher": "", "title": "", "url": "", "published_at": "", "retrieved_at": "" }],
    "verified": true
  }
]
```

`days` holds at least 3 and at most 7 consecutive days starting on the local issue date or later; fewer than 7 is published but flagged by the validator.

`history/YYYY/MM/DD/HH.json`: immutable copies of every `forecast.json` issuance (Phase 3 onward).

### 7.2 Staleness behaviour

Show "Updated 7 Oct 08:00" on the risk card. If the data is older than 36 hours, switch the card to a clear "Data out of date" state and grey the statuses. If `data_mode` is `example`, keep the example tag. Never show example data without the tag.

### 7.3 Back office and content management

**Decision (revised): a small CMS for "news" only, so posts can be published remotely without a redeploy. Everything else stays file-based in the repo.**

Two kinds of content, treated differently:

| Content | Where it lives | Why |
|---|---|---|
| **News / announcements** (service notes, "wind low this week", method updates, outage context) | CMS, fetched at runtime | Must be publishable from a phone without a build |
| Forecast, history, scorecard | Pipeline output (append-only JSON) | Immutability is what makes validation credible; never editable in a CMS |
| Events database (sourced incidents) | `events.yaml` in git, validated by CI | Research data; every entry needs a source link and review. May move into the CMS later, with a "sourced" required field |
| UI strings (EN / PAP), disclaimers | Repo (`en.json`, `pap.json`) | Versioned with the code |

Requirements:

- **CMS: PocketBase** (single Go binary, SQLite, built-in admin UI and REST API; low memory, easy to back up). Pin the version (it is pre-1.0 as far as known, so read release notes before upgrading). Run in Docker with `pb_data` on a volume, on its own subdomain (for example `cms.<domain>`) behind Coolify's proxy (automatic TLS). Admin login with a strong unique password; restrict the admin UI by IP or VPN if practical. Define the `news` collection through committed migrations (`pb_migrations/`) so the schema is reproducible.
- **Access rules on `news`**: list/view is public but only for `status = "published"` and not expired (`expiresAt = "" || expiresAt > @now`); create/update/delete only for the admin and the `bot` account. No public write access, no public user registration.
- **Backups**: PocketBase's built-in scheduled backups, sent to S3-compatible storage off the VPS (verify the option in the pinned version; Coolify's own database backups do not cover an arbitrary volume). Also back up the pipeline's forecast archive (7.6). Restore tested once before launch.
- **Accounts**: PocketBase supports several admin accounts, so a second person (for example the Papiamentu reviewer) can be added later without changes. Not needed in v1. Design for it now: every `news` and `sites` record has `author` and `updatedBy`, and text fields that need review have a `pap_reviewed` flag (bool) so a reviewer's work is visible. A restricted `editors` auth collection (can edit `*_pap` fields only, cannot publish or delete) is a later option.
- **Telegram bot (Phase 1b, optional but wanted)**: a small separate Python container (`python-telegram-bot` or `aiogram`) that creates, edits and deletes `news` records through the PocketBase REST API. UI and bot write to the same collection, so the site cannot tell them apart; each record stores `source` (`ui` or `telegram`) and `author`.
  - Commands: `/news <text>` creates a draft; `/important` or `/notice` sets severity on the last draft; `/pap <text>` adds the Papiamentu text; `/expire 3d` sets an expiry; `/publish` publishes after the bot echoes the draft back for confirmation; `/list` shows recent items; `/delete <id>` removes one.
  - Security: only the allowlisted Telegram user ID(s) from config are served, all others silently ignored; with a webhook, verify Telegram's secret token on every request (long polling needs no public route and is the default); bot token and bot password only in environment variables; the bot authenticates as a dedicated PocketBase `bot` account whose rules allow create/update/delete on `news` only, never as superuser; drafts by default, publish needs an explicit confirmation; basic rate limit; plain text and links only (no HTML, no formatting); revoking access means removing the ID from config.
  - Images and long formatted posts are UI-only.
- A fallback if PocketBase is ever dropped: Payload (already in Chaco's stack) or a JSON file behind a small authenticated form; the site only depends on the `news.json` contract below.
- **As built (step 7)**: the public rule is `status = "published" && publishedAt <= @now && (expiresAt = "" || expiresAt > @now)`, so scheduled posts stay hidden until their time; publishing stamps `publishedAt` when empty. Bodies are plain text. Links must be `https://`. `author`, `updatedBy` and `source` are set by hooks and cannot be rewritten. The site learns the CMS origin at runtime from `/config.json`. In compact layouts the news chip gets its own grid row (under the island in landscape), so it never covers the island.
- **News fields**: `title_en`, `title_pap` (optional), `body_en`, `body_pap` (optional), `publishedAt`, `expiresAt` (optional), `severity` (`info|notice|important`), `link` (optional), `pinned` (bool). Draft/published status. Body is plain text or a restricted rich-text subset (paragraphs, bold, links); no raw HTML.
- **Delivery**: the static site fetches published, non-expired items **at runtime** from the PocketBase records endpoint (`/api/collections/news/records` with the filter and sort in the query) or from a `news.json` produced by a PocketBase hook; the front end maps either to the same internal shape. Cache for about 60 seconds at the proxy or via `Cache-Control`. The browser never talks to the admin API.
- **Resilience**: if the fetch fails or times out, the page renders normally without news (no error banner) and may show the last cached copy from `localStorage`. The CMS being down must never take down the dashboard. The forecast does not depend on the CMS in any way.
- **Language**: show `*_pap` when the toggle is PAP and it exists, otherwise English.
- **Safety**: render news as text (escape everything, links get `rel="noopener noreferrer"`), strict CSP allowing only the CMS origin for `connect-src`, CORS limited to the site origin, rate limiting on the public endpoint, no user accounts on the public side.
- **UI**: a news strip or card on the left column (below the risk card, above stats on desktop; a dismissible chip above the day strip on mobile). Important items stay visible until dismissed or expired. News is never mixed into the risk level and must not imply a forecast change unless the pipeline produced it.
- **Governance**: news must not make unsourced claims about the utility. Outage reports cite a source or say "reported by" with the origin. Add a short editorial rule to `docs/methodology.md`.
- **Not in v1**: community outage reports, comments, user accounts. If added later they get their own moderated collection and never feed the forecast as ground truth.

### 7.4 Geography in the CMS and the link to 3D models

**Decision: the real island geography and the site list are managed in the CMS (PocketBase) and linked to 3D models by name (`slug`).** Wind is not split by park (see 12.6).

`sites` collection (one record per place on the map):
- Seed slugs: wind `terakora` (2 parks), `playakanoa` (1 park), `koraaltabak` (1 park); `dokweg` (thermal, Aqualectra's main site, `placement = exact`). Solar and battery are not seeded (out of scope for v1). (The prototype's `kanoa` becomes `playakanoa`; no forecast has been issued yet, so renaming is safe.)
- `parks` (optional, list of park names at that location, edited in the CMS and shown on the site card; seed: Tera Kora I and Tera Kora II at `terakora`), `slug` (unique, lowercase, `[a-z0-9_]`; this is the join key everywhere: the model node `site_<slug>`, the keys in `forecast.json`, the card, the label)
- `name_en`, `name_pap`, `kind` (`wind|thermal|other`; `solar` and `battery` can be added later), `lat`, `lon`, `enabled`, `sortOrder`
- `description_en`, `description_pap`, `pap_reviewed`, `source_url`, `source_note`
- `placement`: `exact` (public location, placed by `lat`/`lon`) or `approximate` (area known; the card shows a soft "approximate location" note)
- optional `modelOffset` (x, z metres) and `modelRotation` (degrees) to nudge a model without moving the real coordinate

**Seed order of the sites from west to east (decided):** Tera Kora, Dokweg, Playa Kanoa, Koraal Tabak. Until the OpenStreetMap step, the placeholder positions on the stylised island keep this order; afterwards each site is placed at its exact location.

**As built (step 8, 9 Oct 2026)**: `pipeline/tools/build_island.py` downloads the coastline and power features through Overpass, keeps the main island, simplifies and smooths it to 150 to 400 vertices, and writes the outline (with an ODbL `source` record) and the site coordinates, rounded to about 100 m, into the snapshot. A CMS migration fills them into existing records only where they are empty. Positions: Dokweg from way 1138435502 and Playa Kanoa from relation 3972363 (named in OSM); Koraal Tabak from four unnamed turbines (confirmed by the maintainer); Tera Kora set by the maintainer to 12.228, -69.016 with relation 14071783 as reference (`OVERRIDES` in the tool). All `placement = exact`. The on-site credit reads "Map data from OpenStreetMap", linked to openstreetmap.org/copyright (an accepted form under the OSMF attribution guidelines). Scene: 1 unit = 1 km, north = -z, default view from the south so west is on the left; the compass shows true north. Site tiles are drawn at 0.75 scale and, where a coastal tile would overhang the sea, moved inland up to 3.5 km in the scene only (the data keeps the real coordinate). Handmade `.glb` models are loaded only when `web/public/models/manifest.json` names one; uncompressed until the CSP allows WebAssembly for Draco/Meshopt.

**Outline source (decided): OpenStreetMap.** Take the Curaçao coastline (the island's land polygon, excluding Klein Curaçao unless wanted) from OSM via Overpass or a Geofabrik extract, then simplify with `mapshaper` or `shapely` to about 150 to 400 vertices (enough for the toy look, small enough to extrude cheaply), smooth slightly, and store the result as GeoJSON in the `island` record. Keep the script in `pipeline/tools/build_island.py` so it is reproducible. OSM is detailed, current and free; the licence (ODbL) only requires attribution for this use (see 8.3). Fallback if OSM is awkward: Natural Earth 10m land (public domain, coarse but fine for a low-poly island).

`island` collection (one active record):
- `outline` (GeoJSON polygon, simplified low-poly), `anchorLat`, `anchorLon`, `metresPerUnit`, `rotation`, `version`

Linking rules:
- **Projection**: the front end converts `lat/lon` to scene `x/z` with one fixed projection (equirectangular around the anchor, which is accurate enough at this scale) using `anchorLat/Lon`, `metresPerUnit` and `rotation`. The same function is used for the outline and for sites, so they always line up.
- **Join by name**: for each enabled `sites` record, find the node `site_<slug>` in the loaded `.glb` and place it at the projected position (plus `modelOffset`). The status tile, label and card are created in code from the record.
- **Missing model**: a record without a matching node renders a generic marker of the right `kind` (a simple clay pillar with the status tile), never an error.
- **Missing record**: a `site_*` node with no record stays hidden and logs a warning in development.
- **Island base**: if a hand-made `island` node exists in the `.glb`, it is aligned with the same anchor and scale; otherwise the base is extruded in code from `outline`. The two must be georeferenced consistently (record the Blender origin as `anchorLat/Lon`).
- **Forecast keys**: `forecast.json` statuses are keyed by `slug`. A site without a status shows "No data"; a status for an unknown slug is ignored and logged.
- **Resilience**: `sites.snapshot.json` (a committed export of both collections, refreshed by a script) ships inside the static build. The page uses the CMS data when reachable and valid against the schema, otherwise the snapshot. The pipeline reads the snapshot, so a CMS outage never blocks forecasting.
- **Changes are not silent**: editing a slug is blocked once a forecast has been issued for it (slugs are permanent; use `enabled=false` and a new record instead), so the history stays consistent.
- **Public data only**: positions come from public maps or published sources, rounded to what the map needs. No sensitive operational detail.
- **Tests**: unit test the projection (known coordinates to known scene positions), a CI check that every `enabled` slug has a model node or is deliberately marker-only, and the Playwright suite renders with the snapshot and with the CMS unreachable.

### 7.5 3D asset pipeline (Nomad Sculpt / Blender)

**Format: glTF 2.0 binary (`.glb`), loaded with three.js `GLTFLoader`, with Draco or Meshopt compression and KTX2 textures if textures are used.** The prototype currently builds geometry in code; this section lets handmade assets replace or sit alongside it.

- **Source files** live in `assets/src/` (`.blend`, `.nsc`), exports in `web/public/models/*.glb`. Commit both; the export is reproducible from source.
- **Authoring in Nomad Sculpt**: sculpt at any resolution, then decimate and retopologise before leaving Nomad (target under 20k triangles per site model, under 60k for the whole island). Export OBJ or glTF, finish in Blender. Prefer vertex colours or simple flat materials; the clay look comes from soft shapes, rounded bevels and lighting, not from heavy textures.
- **Blender export** (File > Export > glTF 2.0, `.glb`): apply all transforms (Ctrl+A), +Y up (default), metres, origin at the base centre of each model, Principled BSDF only (base colour, roughness, metallic; no node-heavy shaders). Include vertex colours if used. No cameras or lights in the export; the scene lights come from three.js so the day/night blend keeps working.
- **Naming contract**: one node per site named `site_<slug>`, where `<slug>` is exactly the `slug` of a record in the CMS `sites` collection (7.4): `site_playakanoa`, `site_terakora`, `site_koraaltabak`, `site_dokweg` to start. One node for the island base (`island`), props prefixed `prop_`. Animated parts get their own nodes (`<slug>_blades` for turbine rotors, `dokweg_stack`) so code can rotate or glow them without baked animation. The status tile is created in code, not in the model.
- **Compression**: run `gltf-transform optimize` (Draco or Meshopt, dedupe, prune, weld). Budget: island plus all sites under 1.5 MB gzipped, textures (if any) 1024 px max, KTX2 or WebP. Lazy-load the model after first paint; show the current code-built island as the placeholder.
- **Materials and lighting**: replace imported materials with the project's `MeshStandardMaterial` presets in code, keyed by material name (`clay_green`, `clay_white`, `glass`, `emissive_window`), so day/night colours and the window glow stay controlled by tokens.
- **Shadows**: do not bake lighting into textures if night mode is to look right. If baked ambient occlusion is used, keep it as a separate subtle vertex-colour or AO map that multiplies.
- **Acceptance**: each model loads in under 1 s on a mid-range phone on 4G, renders correctly in both modes, keeps 60 fps on a 2020-era phone, and its picking mesh matches the clickable area (use a simplified invisible collision mesh or bounding shape per site).

### 7.6 Hosting and deployment (Hostinger VPS + Coolify)

- **Platform**: Coolify on the existing Hostinger VPS. Coolify's proxy provides domains and automatic TLS, so the repo does not ship its own reverse proxy config. Deploy from Git (webhook on push to `main`) using Dockerfiles or one `docker-compose.yaml`.
- **Services**:
  - `web`: static export served by a small static server image. Sets security headers itself (CSP, `X-Content-Type-Options`, `Referrer-Policy`, HSTS if not set by the proxy) and long-cache headers for hashed assets, short for `/data/*`.
  - `cms`: PocketBase on its own subdomain, `pb_data` on a persistent volume, version pinned.
  - `pipeline`: daily job (Coolify scheduled task or a cron container). Writes `forecast.json`, `history` and the append-only forecast archive to a shared persistent volume that `web` serves under `/data`, so a forecast update never needs a rebuild or redeploy.
  - `bot`: Telegram bot (Phase 1b), long polling, no public route.
- **Domains (decided)**: site at `grid.noirvisuals.studio`; CMS at `cms.grid.noirvisuals.studio`. DNS `A` records for both subdomains point to the VPS IP, and Coolify issues the certificates. Add a `www`-style redirect only if useful. Set CORS on the CMS to the site origin only.
- **Secrets**: PocketBase credentials, the bot token and the Open-Meteo key (if a paid plan is used) live in Coolify environment variables, never in the repo.
- **Observability**: Coolify health checks for `web` and `cms`; the pipeline writes a heartbeat file; if the data is older than 36 hours the site shows "Data out of date" (7.2). Optionally an uptime monitor pings the site and `forecast.json` freshness.
- **Backups**: see 7.3 (PocketBase backups to off-VPS storage) and back up the forecast archive volume the same way. Immutable archive files are never edited in place.
- **Resources**: all services are small; confirm the VPS has headroom next to existing Coolify apps before launch.

## 8. Content requirements

### 8.1 Copy rules
Plain, short sentences. Say "estimated" for estimates and "not public" for unknowns. No jargon in the primary view (hub height, rated output belong on the cards).

### 8.2 Required disclaimers
Visible without scrolling on first load: "Experimental, built from public data, not an official forecast". Longer methodology and limits on a linked page.

### 8.3 Attribution
Footer or brand card reads **"Grid Watch by Noir Visuals"** (plain text until the Noir Visuals site exists, then linked). Data sources credited on the methodology page. Map data: "Map data from OpenStreetMap" linked to openstreetmap.org/copyright (ODbL), shown on the island wherever OSM-derived geometry is used; weather: Open-Meteo (CC BY 4.0).

### 8.4 Seed events (all need source URLs added)

| Date | Type | Summary |
|---|---|---|
| 27 Aug 2025 | Blackout (major) | Wind output fell sharply around 02:30, disturbance escalated to full system collapse. Aqualectra/DNV investigation |
| 25 to 26 Apr 2026 | Outage (major) | Units in maintenance, higher evening demand, battery reliance, not enough generation, load switching |
| 15 Aug 2026 | Controlled switching | Wind dropped earlier than expected, high temperatures raised demand, some capacity in maintenance, batteries used |
| 18 to 19 Aug 2026 | Shortage | Strongly reduced wind, insufficient available generation, maintenance constraints |
| 6 Oct 2026 | Controlled outages | Insufficient capacity, units under repair, strongly reduced wind |

## 9. Non-functional requirements

- **Performance**: 60 fps on a mid-range phone at the default view; cap device pixel ratio at 2; shadow map size and decor count configurable for low-power devices; first meaningful paint under 2.5 s on 4G. Keep the page weight reasonable (bundled three.js, subset fonts).
- **Browsers**: current Safari (iOS and macOS), Chrome, Firefox, Edge. WebGL2 preferred; degrade to the 2D fallback.
- **Privacy**: no accounts, no tracking cookies, no personal data. Only `localStorage` for the display mode. If analytics are added, use a cookie-less privacy-first tool and state it. Fonts: self-host to avoid sending visitor IPs to Google (decision to confirm).
- **Security**: strict CSP (own origin only, plus nothing third-party at runtime if fonts are self-hosted), no inline event handlers, dependency pinning, SRI if any CDN remains.
- **Reliability**: the page works from static files even if the pipeline is down (serves the last good JSON with the staleness state).
- **Observability**: pipeline logs each run (inputs hash, model version, duration) and alerts on failure or stale output.
- **Legal and reputation**: a visible disclaimer, a contact route for corrections (utility or MDC), and a takedown/adjust policy. Prefer conservative wording to avoid false alarms eroding trust. Consider sharing a private preview with Aqualectra and MDC before the public launch.

## 10. Design system

Two looks via `data-mode` on the root element, tokens as CSS variables.

| Token | Day | Night |
|---|---|---|
| `--sea` (ground) | #e6f4f9 | #070d14 |
| `--glow` / `--edge` (ground gradient) | #f6fcfe / #d3eaf2 | #16314a / #04080d |
| `--panel` | #ffffff | rgba(16,28,39,.9) |
| `--soft` | #eef7fa | #1a2b3a |
| `--ink` / `--muted` | #10312a / #547370 (was #5f7f7c, darkened for AA) | #e8f3f1 / #8ea9ad |
| `--line` | #d5e8ee | #26394a |
| `--blue` (progress, leader line) | #1b7bff | #5aa2ff |
| `--blue-text` (blue numbers and links) | #1667d6 | #5aa2ff |
| Selected control | bg #10312a, fg #fff | bg #aee04f, fg #10312a |

Status colours (same in both modes): ok #27c76f, watch #f4c20d, warn #ff8a2b, crit #ff5c5e, unknown #9fb6c0 (night #8299a5). Text on every tone, crit included: #10312a. (Changed 8 Oct 2026 to pass WCAG AA, spec 4.8: crit was #ff4d4f with white text at 3.3:1, night unknown was #6f8794 at 3.7:1, muted was #5f7f7c at 4.0:1 on `--soft`.)

Type: **Baloo 2** (display, 700/800) and **Nunito** (body, 600 to 800). Numbers use tabular figures. Scale in the prototype: title 46 px desktop, percentage 56 px desktop / 40 px mobile, card titles 19 to 20 px, body 13 to 14 px, labels 11 to 12 px.

Shape: pill-shaped controls and chips (999 px), cards 24 px radius (20 px for the mobile risk card), soft shadow `0 10px 28px rgba(40,100,125,.16)`.

3D palette: grass #aee04f, hills #c3ea6a, bushes #52b53a / #6cc443, rim #b9784a with band #d9a06a, turbines white with #ffc93c hubs, plant #fff0cf with #ff7a5c roof.

Breakpoint: wide desktop layout when the viewport is over 1500 px wide and at least 1182 px tall; see 4.2 for portrait and landscape otherwise. Side gutter 16 px.

## 11. Testing and acceptance

Automated (Playwright):
- Screenshots at 390x844, 768x1024, 844x390, 1280x800, 1920x1080 and 1920x1200 in day and night; assert no horizontal scroll and that no overlay hides the island on mobile.
- Select each site, assert the card appears and Esc closes it; select each day, assert risk card, chart and site statuses update.
- Mode switch: Auto follows a mocked clock (05:59, 06:00, 17:59, 18:00), explicit Day/Night persists across reload.
- WebGL disabled: fallback renders and is usable.
- Stale data and example-data states render correctly.
- News: published item appears without rebuild, expired and draft items do not, CMS unreachable leaves the page intact, HTML in a news body is rendered as text.
- Bot: a message from a non-allowlisted ID is ignored; `/news` makes a draft that is not public until `/publish` is confirmed; the bot account cannot read or change anything outside `news`.
- Scene has no sun, solar or battery objects in either mode.
- Axe accessibility scan on all states.

Unit tests (pipeline): power curve, level thresholds, window selection in `America/Curacao`, no-leakage guard (inputs timestamped at or before issue time), schema validation of every published JSON.

Acceptance by phase:
- **Phase 1**: deployed site matches the prototype on desktop and mobile, driven by a validated example `forecast.json`; event sources linked; i18n scaffolding in place; mobile requirement in 4.2 met on real devices; Playwright suite green.
- **Phase 2**: daily live forecast with staleness handling; "stress outlook" wording; methodology page; no probability claims.
- **Phase 3**: sourced event DB; backtest report with baselines, lead times, calibration and the ERA5 caveat; results page with honest uncertainty.
- **Phase 4**: at least 30 days of immutable prospective forecasts; scorecard computed from stored files only.
- **Phase 5**: written data-sharing agreement or at least a meeting outcome with Aqualectra and/or MDC; model re-run with the new data.

## 12. Open questions and decisions

1. **Name**: Grid Watch Curaçao for now. Kilowhat (playful, risk of sounding snarky toward the utility) or Koriente (local, correct Papiamentu spelling) later. Domain: a previously bought domain will be used with a subdomain (final host name still to choose); the free Hostinger domain stays available for later.
2. **DECIDED, Vocabulary**: Low / Moderate / Elevated / High everywhere (UI, legend, data contract `level` values `low|moderate|elevated|high`, docs). Remove Normal / Watch / Strained / Critical from the legend.
3. **DECIDED, Evening window**: 19:00 to 22:00 local. Still re-check against event timestamps once they are sourced; the 27 Aug 2025 blackout happened around 02:30, which this window does not cover (mention in methodology).
4. **DECIDED, Solar and battery**: out of scope for v1 (no confirmed public location or data, and the evening peak is after sunset). No sun marker in either mode. Revisit if public data appears.
5. **DECIDED, Real geography**: lives in the CMS (`sites` and `island` collections), linked to 3D models by slug (section 7.4). **Outline source: OpenStreetMap coastline, simplified** (see 7.4). Site coordinates come from OSM `power=plant`/`power=generator` features cross-checked against Aqualectra/RAC publications. Dokweg is Aqualectra's main site (thermal generation), placed from OSM or Aqualectra publications. Solar and battery are out of scope for v1 (item 4).
6. **DECIDED, Wind output**: there are four parks (two at Tera Kora, one at Playa Kanoa, one at Koraal Tabak), but output is **not split by park**. Wind is shown as one island-wide figure; the three wind markers share the island-wide wind status and their cards say "island total" and list the parks at that location (no per-park capacity unless a source is found). Revisit only if a per-park source appears.
7. **DECIDED, Weather provider**: Open-Meteo (see section 6 for licence conditions). **No outreach to MDC for now**; see item 8.
8. **DECIDED, Outreach**: none for now. Build on public data only. If the project is posted and gains traction, that is the trigger to approach MDC (observations) and Aqualectra (generator availability, load). Keep the post framing as the question, not the claim. The data-sharing agreement stays in Phase 5.
9. **DECIDED, Languages**: English default plus a Papiamentu toggle (section 4.7). Chaco reviews the Papiamentu copy himself for now (a second native reviewer is optional, later).
10. **Community reports**: optional later feature (residents report outages). Noisy; treat as a review signal, never as ground truth.
11. **DECIDED, Hosting and brand**: Hostinger VPS with Coolify already set up; site at `grid.noirvisuals.studio` (domain already owned). Credit line is "Grid Watch by Noir Visuals" (plain text until that site exists). Details in 7.6.

12. **DECIDED, Layout breakpoint (8 Oct 2026, revised)**: the side column plus bottom row layout is used only when the viewport is over 1500 px wide and at least 1182 px tall. Otherwise portrait uses the stacked layout and landscape uses risk card left, island right, day strip below, with a shared top bar for name, events and mode. No on-screen site labels outside the wide layout; sites are picked by tapping the island. Details in 4.2.
13. **DECIDED, Copyright holder**: "Noir Visuals" in `LICENSE` (not yet a registered company; revisit if it becomes one).
14. **DECIDED, Readout format**: the stress index is shown as "18 / 100" with the level, a confidence label and "Not a probability" (spec 5.1); day buttons show the bare index.
15. **DECIDED, Unsourced events are never published (8 Oct 2026)**: `data/events/events.yaml` may hold entries whose sources are still TODO, but the build leaves them out of the published `events.json` until every source field is filled in. The site can deploy at any time; each event appears once it is sourced. A password-protected preview environment may be added later.
16. **DECIDED, PocketBase version (8 Oct 2026)**: pinned exactly to 0.40.5 (the latest release at the time) with a checksum in `deploy/cms/Dockerfile`. PocketBase is pre-1.0 and its authors advise caution in production; accepted for this small news/sites CMS, with committed migrations, off-VPS backups and upgrades only as a deliberate change after reading the release notes.
17. **DECIDED, Pipeline schedule (8 Oct 2026)**: one run a day at 06:00 Curaçao time until Phase 2. From Phase 2: two scheduled runs a day (06:00 and an afternoon run timed to the weather models' updates), plus a manual run triggered from the Telegram bot by an allowlisted user. Every run, scheduled or manual, is stored as its own immutable issuance with the trigger recorded (`scheduled` or `manual`), manual runs are rate-limited, and the scorecard (5.4) states how manual issuances are counted.
18. **DECIDED, Weather sources are swappable (9 Oct 2026)**: the pipeline reads weather through a small source interface (one module per provider, chosen in configuration), so changing provider never touches the stress rules. Phase 2 starts with the free Open-Meteo API while the site is non-commercial (no ads, no subscriptions); before launch, ask Open-Meteo in writing whether the "by Noir Visuals" credit keeps it non-commercial. NOAA GFS is the second module and the source of archived forecasts for Phase 3 backtests; it is also the fallback if Open-Meteo's terms stop fitting. Every stored issuance records the source and model run.
19. **DECIDED, Phase 2 as built (9 Oct 2026)**: `rules-v0` 0.1.0 in `pipeline/stress_config.yaml`. Power curve uses the physical cubic form `(v³ − cut_in³)/(rated³ − cut_in³)` (the prototype's `((v − 3)/9)³` underestimated mid-range output); wind stress is zero at 75 % estimated output or more; demand proxy from the evening heat index between 31 and 39 °C at Dokweg; index = 100 × (0.65 × wind stress + 0.35 × demand). These are starting assumptions, stated as uncalibrated on the methodology page, to be fitted in Phase 3. Runs at 06:00 and 16:00 local; first evening is today when the run is before 19:00. Each run is archived immutably with inputs, model run time, rules version and config hash. Publishing is switched by `GRIDWATCH_PUBLISH` (default off: preview only, viewable with `?preview=1`). The site shows "Updated …" with the Open-Meteo credit, and "Data out of date" with grey statuses after 36 hours (live data only; example data keeps its tag).

## 12b. Licensing and public repository

**Decision: the repository is public and open source, with a split licence.** Not legal advice; review once before launch.

| Part | Licence | Where |
|---|---|---|
| Code (`web/`, `pipeline/`, `cms/` migrations and hooks, `bot/`, `deploy/`) | **MIT** | `LICENSE` at the repo root |
| Docs, spec, methodology, published forecasts and event database | **CC BY 4.0** | `docs/LICENSE`, `data/LICENSE` |
| 3D models and artwork (`assets/`, `web/public/models/`) | **CC BY 4.0** (decided 9 Oct 2026, before the first public push) | `assets/LICENSE` |
| Island outline and anything derived from OpenStreetMap | **ODbL 1.0**, "© OpenStreetMap contributors" | listed in `DATA_LICENSES.md`, attribution in the UI footer or about card |
| Weather data pulled from Open-Meteo | **CC BY 4.0**, credit Open-Meteo wherever data or derived values are republished | `DATA_LICENSES.md`, methodology page |
| Fonts (Baloo 2, Nunito) | SIL Open Font License, self-hosted with their licence files | `web/public/fonts/` |
| Names and logos ("Grid Watch", "Noir Visuals", the mascot "Watt" if used as a logo) | **Not licensed for reuse** | `TRADEMARKS.md` |

Required files in the repo root: `LICENSE`, `README.md` (what it is, what it is not, how to run, how to contribute), `DATA_LICENSES.md` (every third-party data source with licence, attribution text and retrieval date), `TRADEMARKS.md`, `CONTRIBUTING.md` (short: issues welcome, discuss before large PRs, contributions are accepted under the repo licences), `CODE_OF_CONDUCT.md` (a standard short one), `SECURITY.md` (how to report a vulnerability privately).

Public-repo hygiene:
- No secrets in the repo or its history. Secrets live in Coolify environment variables. Ship `.env.example` files with placeholder values only. Add a secret scanner (betterleaks, the maintained successor to gitleaks) to CI and as a pre-commit hook, and run it over the full history before the repo is made public.
- `pb_data/`, `.env*` (except examples), local databases and Telegram bot configuration are git-ignored.
- No personal data. The Telegram allowlist (user IDs) is configuration, not committed.
- Every event in the database carries its source link; no unsourced claims about the utility in the repo or docs.
- Dependencies are pinned, with a licence check in CI (all runtime dependencies must be compatible with MIT distribution).
- Keep the "not an operational utility forecast" disclaimer at the top of the README.
- Issue and PR templates: a bug template that asks for viewport, browser and mode; a data-correction template that requires a source.

## 13. First tasks for Claude Code

1. Create the repo structure in section 7, copy the prototype to `docs/prototype/`, add this file as `docs/SPEC.md`, and add the licensing files and public-repo hygiene from section 12b (licences, `DATA_LICENSES.md`, `TRADEMARKS.md`, `CONTRIBUTING.md`, `SECURITY.md`, `.env.example`, secret scanning in CI).
2. Open the prototype at 390x844 and 1440x900 in day and night, capture baseline screenshots, and record any mobile defect against 4.2 (island hidden behind the risk card or sheet, overlapping labels, scroll).
3. Fix mobile per 4.2 (layout-based canvas area), keeping the desktop layout untouched.
4. Port to Next.js + TypeScript: components from section 7, the scene as a module, tokens as CSS variables, i18n keys, JSON loaded from `/data/forecast.json` and `/data/events.json`.
5. Write the JSON schemas and a validator; ship an `example` forecast and the seed events (sources to be filled in by Chaco).
6. Add Playwright tests from section 11 and a CI job.
7. Add the Coolify deployment (7.6): web, cms, pipeline and bot services, domains, persistent volumes, backups.
8. Add the news strip: PocketBase `news` collection with migrations and access rules, runtime fetch with graceful failure (7.3).
   8b. (Phase 1b) Telegram news bot with allowlist, draft/confirm flow and a restricted PocketBase account (7.3).
9. Add the EN / PAP language toggle (4.7) with all strings behind keys; use English as the Papiamentu placeholder until reviewed.
10. Add the `sites` and `island` collections (7.4) and a `GLTFLoader` path that joins `site_<slug>` nodes to records (naming contract in 7.5), keeping the code-built island as fallback.
11. Then start Phase 2: weather fetch, power curve, rule-based index, daily schedule, staleness UI.
