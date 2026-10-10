import { applyRemote, type Lang } from "@/i18n";
import { fetchJson, loadConfig } from "./config";

// Papiamentu interface text from the CMS (spec 4.7): editors publish it there, and the page
// loads it only when that language is chosen. The last copy is kept in this browser, so a
// repeat visit shows it straight away; without the CMS the bundled pap.json is used.

const TIMEOUT_MS = 4000;
const cacheKey = (lang: Lang) => `gridwatch-i18n-${lang}`;
const started = new Set<Lang>();

export function loadTranslations(lang: Lang): void {
  if (lang === "en" || started.has(lang)) return;
  started.add(lang);
  try {
    const cached = localStorage.getItem(cacheKey(lang));
    if (cached) applyRemote(lang, JSON.parse(cached));
  } catch {
    // storage blocked or a broken copy: wait for the CMS
  }
  void (async () => {
    const { cmsOrigin } = await loadConfig();
    if (!cmsOrigin) return;
    try {
      const url = `${cmsOrigin}/api/collections/translations/records?perPage=1000&skipTotal=1&fields=key,pap`;
      const items = ((await fetchJson(url, TIMEOUT_MS)) as { items?: unknown })?.items;
      if (!Array.isArray(items)) return;
      applyRemote(lang, items);
      try {
        localStorage.setItem(cacheKey(lang), JSON.stringify(items));
      } catch {
        // storage blocked: no copy for the next visit
      }
    } catch {
      // CMS down or slow: keep the cached or bundled text
    }
  })();
}
