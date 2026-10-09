# assets

Source 3D models (`src/*.blend`, `src/*.nsc`) and artwork. Exports go to `web/public/models/*.glb`. See SPEC section 7.5 for the naming contract and budgets.

Licensed CC BY 4.0 (see `LICENSE`). The names and logos are not licensed (see `../TRADEMARKS.md`).

## Using a model on the site

1. Export `web/public/models/<name>.glb` (uncompressed for now: Draco/Meshopt decoders need
   WebAssembly, which the site's Content Security Policy does not allow yet).
2. Set `"scene": "<name>.glb"` in `web/public/models/manifest.json`.
3. Node names: `site_<slug>` per site (slugs: `terakora`, `dokweg`, `playakanoa`, `koraaltabak`),
   optional `island` for the base, `prop_*` for props, `<slug>_blades` for rotors (they spin around
   their local Z axis). Materials named `clay_green`, `clay_white`, `glass` and `emissive_window`
   are swapped for the site's own materials so day and night keep working.
4. Scale: 1 unit = 1 km (the island's `metresPerUnit`); +Y up; origin at the base centre of each
   site model. The status tile under each site is drawn by the site, not the model.
