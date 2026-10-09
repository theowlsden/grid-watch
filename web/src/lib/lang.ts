// Interface language (spec 4.7): English by default, Papiamentu by choice, remembered in
// localStorage under gridwatch-lang. public/mode-init.js sets <html lang> before first paint.
import type { Lang } from "@/i18n";

export const LANG_KEY = "gridwatch-lang";

let memory: Lang | null = null;
const listeners = new Set<() => void>();

export function getLang(): Lang {
  if (memory) return memory;
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v === "en" || v === "pap") return v;
  } catch {
    // storage blocked
  }
  return "en";
}

export function setLang(lang: Lang): void {
  memory = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // storage blocked: the choice lasts for this visit only
  }
  listeners.forEach((l) => l());
}

export function subscribeLang(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
