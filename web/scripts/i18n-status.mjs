// Translation status of the bundled pap.json (spec 4.7); the live text is edited in the CMS
// (docs/translating.md). Which English keys have no Papiamentu text yet.
//   npm run i18n:status            summary and the missing keys with their English text
//   npm run i18n:status -- --json  the missing entries as JSON, ready to paste into pap.json
import { readFileSync } from "node:fs";

const read = (f) => JSON.parse(readFileSync(new URL(`../src/i18n/${f}`, import.meta.url), "utf8"));
const en = read("en.json");
const pap = read("pap.json");
const missing = Object.keys(en).filter((k) => !pap[k]);
const stray = Object.keys(pap).filter((k) => !(k in en));

if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify(Object.fromEntries(missing.map((k) => [k, en[k]])), null, 2) + "\n");
} else {
  const done = Object.keys(en).length - missing.length;
  console.log(`Papiamentu: ${done} of ${Object.keys(en).length} keys translated (${Math.round((100 * done) / Object.keys(en).length)} %)`);
  for (const k of missing) console.log(`  ${k}: ${en[k]}`);
  if (stray.length) console.log(`Keys in pap.json that English no longer has (remove them): ${stray.join(", ")}`);
}
