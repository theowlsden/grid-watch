/// <reference path="../pb_data/types.d.ts" />
// A translation whose English changed since it was saved (needs_review) is no longer served:
// the site shows English for that text until an editor has checked the Papiamentu and saved
// the row, which clears the flag (pb_hooks/translations.pb.js). Old text can be wrong after a
// change of meaning, as with the weather-forecast grade in rules 0.1.1.
const RULE = 'status = "published" && pap != "" && obsolete = false && needs_review = false';
const OLD = 'status = "published" && pap != "" && obsolete = false';

migrate(
  (app) => {
    const c = app.findCollectionByNameOrId("translations");
    c.listRule = RULE;
    c.viewRule = RULE;
    app.save(c);
  },
  (app) => {
    const c = app.findCollectionByNameOrId("translations");
    c.listRule = OLD;
    c.viewRule = OLD;
    app.save(c);
  },
);
