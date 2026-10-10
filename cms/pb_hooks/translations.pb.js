/// <reference path="../pb_data/types.d.ts" />
// Papiamentu interface text (spec 4.7). On every start the keys and English text are copied in
// from the site's en.json (baked into the image), so editors only ever fill in Papiamentu:
//   - a new key gets a row (prefilled from the bundled pap.json when it has one);
//   - changed English updates the row and flags the translation for review;
//   - a key the site no longer uses is marked obsolete (hidden, but the text is kept).
// PB_I18N_DIR points at the folder holding en.json and pap.json (tests use web/src/i18n).

onBootstrap((e) => {
  e.next();
  const { problem } = require(`${__hooks}/lib/i18n.js`);
  const dir = $os.getenv("PB_I18N_DIR") || "/pb/seed/i18n";
  let en, pap;
  try {
    en = JSON.parse(toString($os.readFile(`${dir}/en.json`)));
    pap = JSON.parse(toString($os.readFile(`${dir}/pap.json`)));
  } catch (err) {
    console.log(`translations: cannot read ${dir}/en.json or pap.json (${err}); not synced`);
    return;
  }
  let collection;
  try {
    collection = e.app.findCollectionByNameOrId("translations");
  } catch (_) {
    console.log("translations: collection missing (migrations not applied yet); not synced");
    return;
  }
  const rows = {};
  for (const r of e.app.findAllRecords("translations")) rows[r.getString("key")] = r;
  let added = 0, changed = 0, retired = 0;
  for (const key of Object.keys(en)) {
    const text = String(en[key]);
    let r = rows[key];
    if (!r) {
      const bundled = typeof pap[key] === "string" && !problem(key, text, pap[key]) ? pap[key] : "";
      r = new Record(collection);
      r.set("key", key);
      r.set("en", text);
      r.set("pap", bundled);
      r.set("status", bundled ? "published" : "draft");
      r.set("updatedBy", bundled ? "pap.json" : "");
      added++;
    } else if (r.getString("en") === text && !r.getBool("obsolete")) {
      continue;
    } else {
      if (r.getString("en") !== text) {
        r.set("en", text);
        if (r.getString("pap")) r.set("needs_review", true);
      }
      r.set("obsolete", false);
      changed++;
    }
    // sync writes skip the editor checks: changed English must not block the start
    e.app.saveNoValidate(r);
  }
  for (const key of Object.keys(rows)) {
    if (key in en || rows[key].getBool("obsolete")) continue;
    rows[key].set("obsolete", true);
    e.app.saveNoValidate(rows[key]);
    retired++;
  }
  console.log(`translations: ${Object.keys(en).length} keys, ${added} added, ${changed} updated, ${retired} obsolete`);
});

// keys come from the site's code; nobody adds them by hand
onRecordCreateRequest((e) => {
  throw new BadRequestError("Keys come from the site (web/src/i18n/en.json) and are added on start.");
}, "translations");

onRecordUpdateRequest((e) => {
  const { actor } = require(`${__hooks}/lib/actor.js`);
  const before = e.record.original();
  // only the Papiamentu and its status are editable
  for (const f of ["key", "en", "obsolete"]) e.record.set(f, before.get(f));
  e.record.set("updatedBy", actor(e));
  // saving is the review: the editor has seen the current English
  e.record.set("needs_review", false);
  e.next();
}, "translations");

onRecordValidate((e) => {
  const { problem } = require(`${__hooks}/lib/i18n.js`);
  const pap = e.record.getString("pap").trim();
  e.record.set("pap", pap);
  if (e.record.getString("status") === "published" && !pap) {
    throw new BadRequestError("Add the Papiamentu text before publishing.");
  }
  const why = problem(e.record.getString("key"), e.record.getString("en"), pap);
  if (why) throw new BadRequestError(why);
  e.next();
}, "translations");
