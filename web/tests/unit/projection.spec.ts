import { expect, test } from "@playwright/test";
import { northAngle, project, projectWithOffset, toMetres, type IslandGeo } from "../../src/lib/projection";

// Spec 7.4: one projection for outline and sites. Reference values come from the Python
// implementation in pipeline/tools/build_island.py (to_metres), so both stay in step.

const GEO: IslandGeo = { anchorLat: 12.1943, anchorLon: -68.9728, metresPerUnit: 1000, rotation: 0 };

test("the anchor is the scene origin", () => {
  const [x, z] = project(GEO.anchorLat, GEO.anchorLon, GEO);
  expect(Math.abs(x)).toBeLessThan(1e-9);
  expect(Math.abs(z)).toBeLessThan(1e-9);
});

test("known sites land on known scene positions (same as the Python tool)", () => {
  const known: [string, number, number, number, number][] = [
    ["terakora", 12.236, -69.023, -5.456046, -4.636835],
    ["dokweg", 12.125, -68.912, 6.608119, 7.705819],
    ["playakanoa", 12.17, -68.851, 13.237976, 2.70204],
    ["koraaltabak", 12.135, -68.81, 17.694109, 6.593868],
  ];
  for (const [slug, lat, lon, x, z] of known) {
    const [px, pz] = project(lat, lon, GEO);
    expect(px, slug).toBeCloseTo(x, 5);
    expect(pz, slug).toBeCloseTo(z, 5);
  }
});

test("east is +x and north is -z; one unit is metresPerUnit metres", () => {
  const kmEast = 1000 / (6371008.8 * Math.cos((GEO.anchorLat * Math.PI) / 180)) * (180 / Math.PI);
  const kmNorth = (1000 / 6371008.8) * (180 / Math.PI);
  const [ex, ez] = project(GEO.anchorLat, GEO.anchorLon + kmEast, GEO);
  const [nx, nz] = project(GEO.anchorLat + kmNorth, GEO.anchorLon, GEO);
  expect(ex).toBeCloseTo(1, 9);
  expect(ez).toBeCloseTo(0, 9);
  expect(nx).toBeCloseTo(0, 9);
  expect(nz).toBeCloseTo(-1, 9);
  expect(project(GEO.anchorLat + kmNorth, GEO.anchorLon, { ...GEO, metresPerUnit: 500 })[1]).toBeCloseTo(-2, 9);
});

test("rotation turns the map clockwise as seen from above", () => {
  const kmEast = 1000 / (6371008.8 * Math.cos((GEO.anchorLat * Math.PI) / 180)) * (180 / Math.PI);
  const [x, z] = project(GEO.anchorLat, GEO.anchorLon + kmEast, { ...GEO, rotation: 90 });
  // east turns to south (+z)
  expect(x).toBeCloseTo(0, 9);
  expect(z).toBeCloseTo(1, 9);
  expect(northAngle({ ...GEO, rotation: 90 })).toBeCloseTo(-Math.PI / 2, 9);
});

test("model offsets nudge in metres east/north without moving the coordinate", () => {
  const [x, z] = project(12.125, -68.912, GEO);
  const [ox, oz] = projectWithOffset(12.125, -68.912, GEO, [500, -250]);
  expect(ox - x).toBeCloseTo(0.5, 9);
  expect(oz - z).toBeCloseTo(0.25, 9);
});

test("toMetres matches a hand calculation", () => {
  const [e, n] = toMetres(12.2943, -68.9728, GEO);
  expect(e).toBeCloseTo(0, 6);
  expect(n).toBeCloseTo(0.1 * (Math.PI / 180) * 6371008.8, 3);
});
