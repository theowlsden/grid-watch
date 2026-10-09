/// <reference path="../pb_data/types.d.ts" />
// Seed the sites and island records from the committed snapshot (data/sites.snapshot.json),
// so the CMS and the static fallback start identical. Runs once; afterwards the CMS is the
// source and `pipeline/tools/export_sites.py` refreshes the snapshot from it.

migrate((app) => {
  const file = $os.getenv("PB_SEED_FILE") || "/pb/seed/sites.snapshot.json";
  let raw;
  try {
    raw = toString($os.readFile(file));
  } catch (err) {
    console.log(`seed: ${file} not found, sites and island left empty`);
    return;
  }
  const snap = JSON.parse(raw);

  const sites = app.findCollectionByNameOrId("sites");
  const fields = [
    "slug", "name_en", "name_pap", "kind", "parks", "lat", "lon", "placement", "enabled", "sortOrder",
    "description_en", "description_pap", "pap_reviewed", "source_url", "source_note", "modelOffset",
    "modelRotation", "placeholder_uv",
  ];
  for (const s of snap.sites) {
    const r = new Record(sites);
    for (const f of fields) if (s[f] !== undefined && s[f] !== null) r.set(f, s[f]);
    r.set("author", "seed");
    app.save(r);
  }

  const island = app.findCollectionByNameOrId("island");
  const i = new Record(island);
  i.set("version", snap.island.version);
  i.set("active", true);
  for (const f of ["outline", "anchorLat", "anchorLon", "metresPerUnit", "rotation"]) {
    if (snap.island[f] !== null && snap.island[f] !== undefined) i.set(f, snap.island[f]);
  }
  app.save(i);
});
