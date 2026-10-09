/// <reference path="../pb_data/types.d.ts" />
// Sites rules (spec 7.4). Slugs are the join key with forecasts, models and the history,
// so they are permanent: retire a site with enabled = false and add a new record instead.

onRecordUpdate((e) => {
  const before = e.record.original().getString("slug");
  if (before && before !== e.record.getString("slug")) {
    throw new BadRequestError("A site's slug cannot change; disable it and create a new site instead.");
  }
  e.next();
}, "sites");

onRecordValidate((e) => {
  const lat = e.record.get("lat");
  const lon = e.record.get("lon");
  if (e.record.getString("placement") === "exact" && (!lat || !lon)) {
    throw new BadRequestError("Placement 'exact' needs lat and lon.");
  }
  const src = e.record.getString("source_url");
  if (src && !src.startsWith("https://")) throw new BadRequestError("Source links must use https.");
  e.next();
}, "sites");

onRecordCreateRequest((e) => {
  if (e.auth) e.record.set("author", e.auth.email());
  e.next();
}, "sites");

onRecordUpdateRequest((e) => {
  if (e.auth) e.record.set("updatedBy", e.auth.email());
  e.next();
}, "sites");
