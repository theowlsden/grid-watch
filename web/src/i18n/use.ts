"use client";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { dateNames, messagesVersion, subscribeMessages, translator, type Lang } from "@/i18n";
import { getLang, subscribeLang } from "@/lib/lang";
import { loadTranslations } from "@/lib/translations";

/** A translator for one language that updates when the CMS text arrives. The CMS is asked
 *  only when that language is the visitor's choice. */
export function useTranslator(lang: Lang) {
  const version = useSyncExternalStore(subscribeMessages, messagesVersion, () => 0);
  const chosen = useSyncExternalStore(subscribeLang, getLang, () => "en" as const);
  useEffect(() => {
    if (lang === chosen) loadTranslations(lang);
  }, [lang, chosen]);
  // version is a dependency on purpose: new CMS text means a new translator
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const t = useMemo(() => translator(lang), [lang, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dates = useMemo(() => dateNames(lang), [lang, version]);
  return { t, dates };
}

/** The visitor's language (English while hydrating) and its translator. */
export function useI18n() {
  const lang = useSyncExternalStore(subscribeLang, getLang, () => "en" as const);
  return { lang, ...useTranslator(lang) };
}
