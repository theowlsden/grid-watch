/// <reference path="../pb_data/types.d.ts" />
// Papiamentu interface text (spec 4.7). English stays in the repo (web/src/i18n/en.json) and is
// copied in here on every start (pb_hooks/translations.pb.js), so each key has one row with its
// English text for context. Editors fill `pap` and publish; the public reads published rows only.
// Only superusers write (the admin UI); nobody creates keys by hand.

migrate(
  (app) => {
    const translations = new Collection({
      type: "base",
      name: "translations",
      listRule: 'status = "published" && pap != "" && obsolete = false',
      viewRule: 'status = "published" && pap != "" && obsolete = false',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: "text", name: "key", required: true, max: 80, pattern: "^[A-Za-z0-9_.]+$", presentable: true },
        { type: "text", name: "en", max: 2000 },
        { type: "text", name: "pap", max: 2000 },
        { type: "select", name: "status", required: true, maxSelect: 1, values: ["draft", "published"] },
        // the English text changed since the Papiamentu was saved
        { type: "bool", name: "needs_review" },
        // the key is no longer used by the site; kept so a translation is never lost
        { type: "bool", name: "obsolete" },
        { type: "text", name: "updatedBy", max: 120 },
        { type: "autodate", name: "created", onCreate: true, onUpdate: false },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_translations_key ON translations (key)"],
    });
    app.save(translations);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("translations"));
  },
);
