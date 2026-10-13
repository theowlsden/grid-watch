"use client";
import { useSyncExternalStore } from "react";
import type { Lang, Translate } from "@/i18n";
import { getLang, setLang, subscribeLang } from "@/lib/lang";
import { LangSwitch } from "./LangSwitch";

// EN / PAP on the methodology and results pages (spec 4.7). Those pages hold every language
// and CSS shows the one matching <html lang>, so switching only has to set the stored choice and
// the root's lang attribute; Papiamentu from the CMS then loads as on the dashboard.
export function DocLangSwitch({ t }: { t: Translate }) {
  const lang = useSyncExternalStore(subscribeLang, getLang, () => "en" as const);
  const change = (l: Lang) => {
    setLang(l);
    document.documentElement.setAttribute("lang", l);
  };
  return <LangSwitch lang={lang} onChange={change} t={t} />;
}
