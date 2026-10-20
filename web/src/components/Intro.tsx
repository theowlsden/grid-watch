"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { Lang, Translate } from "@/i18n";
import { LangSwitch } from "./LangSwitch";

// First-visit notice (spec 8.2): what the site is and is not, before the numbers are read.
// Shown once per browser; raise INTRO_VERSION when the text changes in meaning, so everyone
// sees it once more. The short disclaimer under the title stays visible as before.
export const INTRO_KEY = "gridwatch-intro";
export const INTRO_VERSION = "1";

function seen(): boolean {
  try {
    return localStorage.getItem(INTRO_KEY) === INTRO_VERSION;
  } catch {
    return false; // storage blocked: show it on every visit rather than never
  }
}

export function Intro({ lang, onLang, t }: { lang: Lang; onLang: (l: Lang) => void; t: Translate }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !seen() && !d.open) d.showModal();
  }, []);
  const markSeen = () => {
    try {
      localStorage.setItem(INTRO_KEY, INTRO_VERSION);
    } catch {
      // storage blocked: it shows again next visit
    }
  };
  const close = () => {
    markSeen();
    ref.current?.close();
  };
  return (
    // a native modal dialog: focus stays inside, Esc closes it (and counts as read). Esc fires
    // "cancel" straight away and "close" a moment later, so the choice is saved on both.
    <dialog ref={ref} id="intro" className="card" aria-labelledby="intro-title" onCancel={markSeen} onClose={markSeen}>
      <div className="intro-top">
        <h2 id="intro-title">{t("intro.title")}</h2>
        <LangSwitch lang={lang} onChange={onLang} t={t} />
      </div>
      <p>{t("intro.p1")}</p>
      <p>
        <strong>{t("intro.p2")}</strong>
      </p>
      <p>{t("intro.p3")}</p>
      <div className="intro-actions">
        <button type="button" className="primary" autoFocus onClick={close}>
          {t("intro.ok")}
        </button>
        <Link href="/methodology" onClick={close}>
          {t("intro.more")}
        </Link>
      </div>
    </dialog>
  );
}
