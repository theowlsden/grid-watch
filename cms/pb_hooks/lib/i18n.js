// Shared checks for translations (spec 4.7). Keep in step with web/src/i18n/index.ts, which
// applies the same checks before using text from the CMS.

/** The {placeholders} in a message, sorted and without duplicates. */
function placeholders(s) {
  const found = (s || "").match(/\{[A-Za-z0-9_]+\}/g) || [];
  return Array.from(new Set(found)).sort().join(",");
}

// date.* keys are comma-separated lists of a fixed length
const LIST_LENGTH = { "date.daysShort": 7, "date.daysLong": 7, "date.monthsShort": 12, "date.monthsLong": 12 };

/** Why a Papiamentu text cannot be used for this key, or "" when it is fine. */
function problem(key, en, pap) {
  if (!pap) return "";
  if (placeholders(pap) !== placeholders(en)) {
    return `Keep the placeholders exactly as in the English text: ${placeholders(en) || "none"}.`;
  }
  const n = LIST_LENGTH[key];
  if (n && pap.split(",").filter((s) => s.trim()).length !== n) {
    return `This is a comma-separated list of ${n} names.`;
  }
  return "";
}

module.exports = { placeholders, problem };
