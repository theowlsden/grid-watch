# schemas

JSON Schemas (draft 2020-12) for every JSON file the site serves or reads:

| Schema | File | Spec |
|---|---|---|
| `forecast.schema.json` | `/data/forecast.json` | 7.1 |
| `events.schema.json` | `/data/events.json` (built from `data/events/events.yaml`) | 7.1, 8.4 |
| `sites-snapshot.schema.json` | `data/sites.snapshot.json` | 7.4 |

`pipeline/validate.py` checks the files against these schemas and adds the rules a schema cannot express (level matches index, consecutive dates, known site slugs, sources present before publishing). The web types in `web/src/lib/schema.ts` mirror these shapes.
