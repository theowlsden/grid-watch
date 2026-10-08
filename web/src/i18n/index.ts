import en from "./en.json";
import pap from "./pap.json";

// Message keys (spec 4.7). English is the default and the fallback: a key missing from
// another language shows the English text, never the key name. nl.json can be added
// here later without touching components.
export type Lang = "en" | "pap";
export type MessageKey = keyof typeof en;

const MESSAGES: Record<Lang, Partial<Record<MessageKey, string>>> = { en, pap };

// Intl locale per language. Papiamentu is not in most Intl data, so dates use English
// month and weekday names until reviewed.
export const LOCALE: Record<Lang, string> = { en: "en-GB", pap: "en-GB" };

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function translator(lang: Lang): Translate {
  return (key, vars) => {
    let s = MESSAGES[lang][key] ?? en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}
