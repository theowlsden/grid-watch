"use client";
import { dayMonth, type DateNames } from "@/lib/time";
import { useState } from "react";
import type { NewsItem } from "@/lib/news";
import type { Lang, Translate } from "@/i18n";

interface Props {
  items: NewsItem[];
  lang: Lang;
  dates: DateNames;
  onDismiss: (id: string) => void;
  t: Translate;
}


// News from the CMS (spec 7.3): a card in the wide layout's left column, a dismissible chip
// above the day strip otherwise (only the first item; dismissing shows the next). Everything
// is rendered as text. News never changes the risk level.
export function News({ items, lang, dates, onDismiss, t }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  if (!items.length) return null;
  return (
    <section id="news" className="card" aria-label={t("news.title")}>
      <h2 className="newsh">{t("news.title")}</h2>
      <ul>
        {items.map((n) => {
          const title = (lang === "pap" && n.title_pap) || n.title_en;
          const body = (lang === "pap" && n.body_pap) || n.body_en;
          const expanded = open === n.id;
          return (
            <li key={n.id} className={`sev-${n.severity}${expanded ? " open" : ""}`}>
              <div className="nhead">
                <span className="ntag">{t(`news.severity.${n.severity}`)}</span>
                <button type="button" className="ntitle" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : n.id)}>
                  {title}
                </button>
                <button type="button" className="nx" aria-label={t("news.dismiss", { title })} onClick={() => onDismiss(n.id)}>
                  ×
                </button>
              </div>
              <div className="nbody">
                <p>{body}</p>
                <p className="nmeta">
                  {dayMonth(n.publishedAt, dates)}
                  {n.link && (
                    <>
                      {" · "}
                      <a href={n.link} target="_blank" rel="noopener noreferrer">
                        {t("news.link")}
                      </a>
                    </>
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
