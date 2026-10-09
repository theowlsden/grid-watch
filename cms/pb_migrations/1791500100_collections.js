/// <reference path="../pb_data/types.d.ts" />
// Collections for news, sites and island (spec 7.3, 7.4) and the restricted bot account.
// Superusers bypass all rules; nobody else may write sites or island, and there is no
// public sign-up anywhere.

const SLUG = "^[a-z0-9_]+$";

migrate(
  (app) => {
    // --- bots: auth collection for the Telegram bot (Phase 1b). Only superusers manage it. ---
    const bots = new Collection({
      type: "auth",
      name: "bots",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      authRule: "",
      manageRule: null,
      passwordAuth: { enabled: true, identityFields: ["email"] },
      fields: [{ type: "text", name: "name", max: 60 }],
    });
    app.save(bots);

    // --- news: published from the admin UI or the bot; read publicly only when live. ---
    const writer = '@request.auth.collectionName = "bots"';
    const news = new Collection({
      type: "base",
      name: "news",
      listRule: 'status = "published" && publishedAt <= @now && (expiresAt = "" || expiresAt > @now)',
      viewRule: 'status = "published" && publishedAt <= @now && (expiresAt = "" || expiresAt > @now)',
      createRule: writer,
      updateRule: writer,
      deleteRule: writer,
      fields: [
        { type: "text", name: "title_en", required: true, max: 140, presentable: true },
        { type: "text", name: "title_pap", max: 140 },
        { type: "text", name: "body_en", required: true, max: 2000 },
        { type: "text", name: "body_pap", max: 2000 },
        { type: "select", name: "status", required: true, maxSelect: 1, values: ["draft", "published"] },
        { type: "select", name: "severity", required: true, maxSelect: 1, values: ["info", "notice", "important"] },
        { type: "date", name: "publishedAt" },
        { type: "date", name: "expiresAt" },
        { type: "url", name: "link" },
        { type: "bool", name: "pinned" },
        { type: "select", name: "source", maxSelect: 1, values: ["ui", "telegram"] },
        { type: "text", name: "author", max: 120 },
        { type: "text", name: "updatedBy", max: 120 },
        { type: "bool", name: "pap_reviewed" },
        { type: "autodate", name: "created", onCreate: true, onUpdate: false },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE INDEX idx_news_live ON news (status, publishedAt)"],
    });
    app.save(news);

    // --- sites: one record per place on the map; joined to 3D models by slug (spec 7.4). ---
    const sites = new Collection({
      type: "base",
      name: "sites",
      listRule: "enabled = true",
      viewRule: "enabled = true",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: "text", name: "slug", required: true, max: 40, pattern: SLUG, presentable: true },
        { type: "text", name: "name_en", required: true, max: 80 },
        { type: "text", name: "name_pap", max: 80 },
        { type: "select", name: "kind", required: true, maxSelect: 1, values: ["wind", "thermal", "other"] },
        { type: "json", name: "parks", maxSize: 2000 },
        { type: "number", name: "lat", min: 11.9, max: 12.5 },
        { type: "number", name: "lon", min: -69.3, max: -68.6 },
        { type: "select", name: "placement", required: true, maxSelect: 1, values: ["exact", "approximate"] },
        { type: "bool", name: "enabled" },
        { type: "number", name: "sortOrder", onlyInt: true },
        { type: "text", name: "description_en", max: 1000 },
        { type: "text", name: "description_pap", max: 1000 },
        { type: "bool", name: "pap_reviewed" },
        { type: "url", name: "source_url" },
        { type: "text", name: "source_note", max: 300 },
        { type: "json", name: "modelOffset", maxSize: 200 },
        { type: "number", name: "modelRotation" },
        { type: "json", name: "placeholder_uv", maxSize: 200 },
        { type: "text", name: "author", max: 120 },
        { type: "text", name: "updatedBy", max: 120 },
        { type: "autodate", name: "created", onCreate: true, onUpdate: false },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_sites_slug ON sites (slug)"],
    });
    app.save(sites);

    // --- island: the georeferenced outline; one active record (spec 7.4). ---
    const island = new Collection({
      type: "base",
      name: "island",
      listRule: "active = true",
      viewRule: "active = true",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { type: "text", name: "version", required: true, max: 40, presentable: true },
        { type: "bool", name: "active" },
        { type: "json", name: "outline", maxSize: 500000 },
        { type: "number", name: "anchorLat", min: 11, max: 13 },
        { type: "number", name: "anchorLon", min: -70, max: -68 },
        { type: "number", name: "metresPerUnit", min: 0 },
        { type: "number", name: "rotation" },
        { type: "autodate", name: "created", onCreate: true, onUpdate: false },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
    });
    app.save(island);
  },
  (app) => {
    for (const name of ["island", "sites", "news", "bots"]) {
      app.delete(app.findCollectionByNameOrId(name));
    }
  },
);
