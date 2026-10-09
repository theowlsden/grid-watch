// Writes tests/fixtures/sites.glb: a tiny glTF binary with two named box nodes, to test the
// model join (spec 7.4, 7.5): `site_dokweg` (matches a site record) and `site_nowhere`
// (no record, must stay hidden). No dependencies.   node tests/fixtures/make-glb.mjs
import { writeFileSync } from "node:fs";

const p = [-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, -1, 2, -1, 1, 2, -1, 1, 2, 1, -1, 2, 1];
const idx = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
const pos = Buffer.from(new Float32Array(p).buffer);
const ind = Buffer.from(new Uint16Array(idx).buffer);
const bin = Buffer.concat([pos, ind, Buffer.alloc((4 - ((pos.length + ind.length) % 4)) % 4)]);

const json = {
  asset: { version: "2.0", generator: "grid-watch test fixture" },
  scene: 0,
  scenes: [{ nodes: [0, 1] }],
  nodes: [
    { name: "site_dokweg", mesh: 0, translation: [0, 0, 0] },
    { name: "site_nowhere", mesh: 0, translation: [5, 0, 5] },
  ],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
  materials: [{ name: "clay_white", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }],
  buffers: [{ byteLength: bin.length }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: pos.length, target: 34962 },
    { buffer: 0, byteOffset: pos.length, byteLength: ind.length, target: 34963 },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 8, type: "VEC3", min: [-1, 0, -1], max: [1, 2, 1] },
    { bufferView: 1, componentType: 5123, count: idx.length, type: "SCALAR" },
  ],
};
let js = Buffer.from(JSON.stringify(json));
js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); // "glTF"
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
const chunk = (type, data) => {
  const h = Buffer.alloc(8);
  h.writeUInt32LE(data.length, 0);
  h.writeUInt32LE(type, 4);
  return Buffer.concat([h, data]);
};
writeFileSync(new URL("./sites.glb", import.meta.url), Buffer.concat([header, chunk(0x4e4f534a, js), chunk(0x004e4942, bin)]));
console.log("wrote tests/fixtures/sites.glb");
