# Translating Grid Watch into Papiamentu

English lives in the code (`web/src/i18n/en.json`). Papiamentu is written and published in the CMS,
in the **translations** collection at `https://cms.grid.noirvisuals.studio/_/`. Any CMS superuser
can translate and publish. A key without published Papiamentu shows the English text, never the key
name, so you can translate in parts.

## Workflow

1. Open **translations** in the CMS admin. Each row is one piece of text: `key`, the English text
   (`en`, for context), and the Papiamentu (`pap`).
2. Fill in `pap`, set `status` to **published** and save. The site picks it up within about a minute
   (the CMS lets browsers cache it for 60 s); no redeploy is needed.
3. Handy filters (the search box in the admin):
   - not translated yet: `pap = ""`
   - English changed since you translated it: `needs_review = true`
   - drafts: `status = "draft"`
4. Keep the `{placeholders}` exactly as in the English, e.g. `"Updated {time}"` → `"... {time}"`.
   The CMS refuses a save that drops or renames one.
5. Date names are comma-separated lists: `date.daysShort` and `date.daysLong` (7, Sunday first),
   `date.monthsShort` and `date.monthsLong` (12, January first). The CMS checks the count.
6. Level names (`level.*`) and every disclaimer must be translated before launch (spec 4.7).
7. Check the page: switch to PAP on the site, and open `/methodology` too.

While fewer than 95 % of the keys are translated, the site shows a short note in PAP mode that
Papiamentu is being reviewed. It disappears automatically once the translation is (nearly) complete.

## How the rows get there

- Keys and English are copied into the CMS on every start, from the `en.json` built into the CMS
  image. A new key in the code appears as a new draft row after the next deploy.
- When the English of a key changes, its row is flagged `needs_review`; the old Papiamentu stays
  visible until you update it. Saving the row clears the flag.
- A key the code no longer uses is marked `obsolete`: hidden from the site, the text is kept.
- Keys cannot be added or renamed in the CMS; that happens in the code.

## The bundled copy

`web/src/i18n/pap.json` is the fallback the site uses when the CMS cannot be reached (and the seed for
a fresh CMS). Refresh it now and then from the published text and commit it:

```sh
cd web
npm run i18n:pull -- https://cms.grid.noirvisuals.studio
npm run i18n:status   # how far along the bundled copy is
```

## Not translated here

- Event titles and source names stay in their original language (spec 4.7).
- News items and site names have their own Papiamentu fields in the CMS: fill `title_pap` /
  `body_pap` on news and `name_pap` / `description_pap` on sites, and tick `pap_reviewed` when a
  native speaker has checked them.
