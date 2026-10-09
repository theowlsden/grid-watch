# Translating Grid Watch into Papiamentu

The site's text lives in `web/src/i18n/en.json` (English, the default) and `web/src/i18n/pap.json`
(Papiamentu). Any key missing from `pap.json` shows the English text, never the key name, so you can
translate in parts. The EN / PAP switch is next to Auto / Day / Night; the choice is remembered in the
browser (`gridwatch-lang`).

## Workflow

```sh
cd web
npm run i18n:status            # how far along, and which keys are missing
npm run i18n:status -- --json  # the missing entries with their English text, to paste into pap.json
```

1. Paste the JSON output into `src/i18n/pap.json` (or a part of it) and replace the English values.
2. Keep the `{placeholders}` exactly as they are, e.g. `"Updated {time}"` → `"... {time}"`.
3. Date names are comma-separated lists: `date.daysShort` (7, Sunday first), `date.daysLong`,
   `date.monthsShort` (12, January first), `date.monthsLong`. A list with the wrong count falls back
   to English.
4. Level names (`level.*`) and every disclaimer must be translated before launch (spec 4.7).
5. Check the page with `npm run dev`, switch to PAP, and open `/methodology` too.

While fewer than 95 % of the keys are translated, the site shows a short note in PAP mode that
Papiamentu is being reviewed. It disappears automatically once the translation is (nearly) complete.

## Not translated here

- Event titles and source names stay in their original language (spec 4.7).
- News items and site names come from the CMS: fill `title_pap` / `body_pap` on news and `name_pap` /
  `description_pap` on sites, and tick `pap_reviewed` when a native speaker has checked them.
