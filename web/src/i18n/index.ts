import en from "./en.json";
import pap from "./pap.json";
import type { DateNames } from "@/lib/time";

// Message keys (spec 4.7). English is the default and the fallback: a key missing from
// another language shows the English text, never the key name. nl.json can be added here
// later without touching components.
export type Lang = "en" | "pap";
export const LANGS: Lang[] = ["en", "pap"];
export type MessageKey = keyof typeof en;

const MESSAGES: Record<Lang, Partial<Record<MessageKey, string>>> = { en, pap };

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

function message(lang: Lang, key: MessageKey): string {
  return MESSAGES[lang][key] ?? en[key] ?? key;
}

export function translator(lang: Lang): Translate {
  return (key, vars) => {
    let s = message(lang, key);
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

/** Weekday and month names (comma-separated date.* keys); a malformed list falls back to English. */
export function dateNames(lang: Lang): DateNames {
  const list = (key: MessageKey, n: number) => {
    const own = message(lang, key).split(",").map((s) => s.trim());
    return own.length === n && own.every(Boolean) ? own : en[key].split(",").map((s) => s.trim());
  };
  return {
    daysShort: list("date.daysShort", 7),
    daysLong: list("date.daysLong", 7),
    monthsShort: list("date.monthsShort", 12),
    monthsLong: list("date.monthsLong", 12),
  };
}

/** Share of English keys that have a translation (for the "being translated" note). */
export function coverage(lang: Lang): number {
  const keys = Object.keys(en) as MessageKey[];
  return keys.filter((k) => MESSAGES[lang][k]).length / keys.length;
}
