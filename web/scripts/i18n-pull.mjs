// Copies the Papiamentu published in the CMS into src/i18n/pap.json (spec 4.7), so the
// bundled fallback stays close to what the site shows. Reads the public API: published rows only.
//   npm run i18n:pull -- https://cms.grid.noirvisuals.studio
import { readFileSync, writeFileSync } from "node:fs";

const origin = (process.argv[2] ?? "").replace(/\/+$/, "");
if (!/^https?:\/\/[^/\s]+$/.test(origin)) {
  console.error("usage: npm run i18n:pull -- https://cms.example.org");
  process.exit(1);
}
const file = (f) => new URL(`../src/i18n/${f}`, import.meta.url);
const en = JSON.parse(readFileSync(file("en.json"), "utf8"));
const res = await fetch(`${origin}/api/collections/translations/records?perPage=1000&skipTotal=1&fields=key,pap`);
if (!res.ok) {
  console.error(`${origin}: HTTP ${res.status}`);
  process.exit(1);
}
const { items } = await res.json();
const published = Object.fromEntries(items.map((i) => [i.key, i.pap]));
// same order as en.json; keys the site no longer has are dropped
const pap = Object.fromEntries(Object.keys(en).filter((k) => published[k]).map((k) => [k, published[k]]));
writeFileSync(file("pap.json"), JSON.stringify(pap, null, 2) + "\n");
console.log(`pap.json: ${Object.keys(pap).length} of ${Object.keys(en).length} keys from ${origin}`);
