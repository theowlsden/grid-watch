/// <reference path="../pb_data/types.d.ts" />
// Step 8: real geography. Adds the island's `source` (attribution) field and fills the outline
// and site coordinates from the committed snapshot (built by pipeline/tools/build_island.py
// from OpenStreetMap), but only where the CMS still has them empty, so edits made in the CMS
// are never overwritten.

migrate(
  (app) => {
    const island = app.findCollectionByNameOrId("island");
    island.fields.add(new JSONField({ name: "source", maxSize: 2000 }));
    app.save(island);

    const file = $os.getenv("PB_SEED_FILE") || "/pb/seed/sites.snapshot.json";
    let snap;
    try {
      snap = JSON.parse(toString($os.readFile(file)));
    } catch (err) {
      console.log(`island_osm: ${file} not found, nothing filled`);
      return;
    }
    const empty = (r, f) => {
      const v = r.getString(f);
      return v === "" || v === "null";
    };

    const records = app.findRecordsByFilter("island", "active = true", "-updated", 1, 0);
    if (records.length && snap.island) {
      const r = records[0];
      if (snap.island.outline && empty(r, "outline")) {
        r.set("outline", snap.island.outline);
        for (const f of ["anchorLat", "anchorLon", "metresPerUnit", "rotation"]) r.set(f, snap.island[f]);
        r.set("version", snap.island.version);
      }
      if (snap.island.source && empty(r, "source")) r.set("source", snap.island.source);
      app.save(r);
    }

    for (const s of snap.sites) {
      if (s.lat === null || s.lon === null) continue;
      let r;
      try {
        r = app.findFirstRecordByData("sites", "slug", s.slug);
      } catch (_) {
        continue;
      }
      if (r.getFloat("lat") !== 0 || r.getFloat("lon") !== 0) continue;
      r.set("lat", s.lat);
      r.set("lon", s.lon);
      r.set("placement", s.placement);
      if (s.source_url) r.set("source_url", s.source_url);
      if (s.source_note) r.set("source_note", s.source_note);
      r.set("updatedBy", "seed:osm");
      app.save(r);
    }
  },
  (app) => {
    const island = app.findCollectionByNameOrId("island");
    island.fields.removeByName("source");
    app.save(island);
  },
);
