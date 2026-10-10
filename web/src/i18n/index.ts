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

// Published text from the CMS (src/lib/translations.ts) wins over the bundled file, which
// stays as the fallback when the CMS is down. A small external store, so pages re-render
// when it arrives.
const remote: Partial<Record<Lang, Partial<Record<MessageKey, string>>>> = {};
let version = 0;
const listeners = new Set<() => void>();

export function subscribeMessages(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function messagesVersion(): number {
  return version;
}

const placeholders = (s: string) => [...new Set(s.match(/\{[A-Za-z0-9_]+\}/g) ?? [])].sort().join(",");

/** Use CMS rows ({ key, pap }) that fit: known key, plain string, same placeholders as English
 *  (the CMS checks the same on save: cms/pb_hooks/lib/i18n.js). Returns how many were used. */
export function applyRemote(lang: Lang, rows: unknown): number {
  if (lang === "en" || !Array.isArray(rows)) return 0;
  const out: Partial<Record<MessageKey, string>> = {};
  for (const r of rows as { key?: unknown; pap?: unknown }[]) {
    if (!r || typeof r.key !== "string" || !Object.hasOwn(en, r.key) || typeof r.pap !== "string") continue;
    const key = r.key as MessageKey;
    const text = r.pap.trim().slice(0, 2000);
    if (text && placeholders(text) === placeholders(en[key])) out[key] = text;
  }
  remote[lang] = out;
  version++;
  listeners.forEach((l) => l());
  return Object.keys(out).length;
}

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

function message(lang: Lang, key: MessageKey): string {
  return remote[lang]?.[key] ?? MESSAGES[lang][key] ?? en[key] ?? key;
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
  return keys.filter((k) => remote[lang]?.[k] || MESSAGES[lang][k]).length / keys.length;
}
