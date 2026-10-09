// One projection for the island outline and every site, so they always line up (spec 7.4).
// Equirectangular around the island anchor: accurate to well under 0.1 percent at this scale.
// Scene axes: +x is east, -z is north (the default camera looks north from the south).
// Keep in step with pipeline/tools/build_island.py (to_metres).

export interface IslandGeo {
  anchorLat: number;
  anchorLon: number;
  metresPerUnit: number;
  rotation: number; // degrees, turns the map clockwise as seen from above
}

const R_EARTH = 6371008.8;
const RAD = Math.PI / 180;

/** Metres east and north of the anchor. */
export function toMetres(lat: number, lon: number, g: Pick<IslandGeo, "anchorLat" | "anchorLon">): [number, number] {
  return [(lon - g.anchorLon) * RAD * Math.cos(g.anchorLat * RAD) * R_EARTH, (lat - g.anchorLat) * RAD * R_EARTH];
}

/** Scene position [x, z] of a latitude/longitude. */
export function project(lat: number, lon: number, g: IslandGeo): [number, number] {
  const [e, n] = toMetres(lat, lon, g);
  const r = g.rotation * RAD;
  // clockwise rotation as seen from above, then north to -z
  const ex = e * Math.cos(r) + n * Math.sin(r);
  const nx = -e * Math.sin(r) + n * Math.cos(r);
  return [ex / g.metresPerUnit, -nx / g.metresPerUnit];
}

/** Scene position plus a model nudge in metres east/north (spec 7.4 modelOffset). */
export function projectWithOffset(lat: number, lon: number, g: IslandGeo, offset: [number, number] | null): [number, number] {
  const [x, z] = project(lat, lon, g);
  if (!offset) return [x, z];
  const r = g.rotation * RAD;
  const [e, n] = offset;
  return [x + (e * Math.cos(r) + n * Math.sin(r)) / g.metresPerUnit, z - (-e * Math.sin(r) + n * Math.cos(r)) / g.metresPerUnit];
}

/** Direction of north on screen relative to the scene's -z axis, in radians (for the compass). */
export function northAngle(g: IslandGeo): number {
  return -g.rotation * RAD;
}
