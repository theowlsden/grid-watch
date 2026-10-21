"use client";
import { dayMonth, eventPeriod, issuedShort, type DateNames } from "@/lib/time";
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


// News and notices from the CMS (spec 7.3, decision 25): a card in the wide layout's left
// column, a dismissible chip above the day strip otherwise (only the first item; dismissing
// shows the next). Notices (the utility's announcements) come first, under their own label;
// news is the project's own messages. Everything is rendered as text and never changes the
// risk level.
export function News({ items, lang, dates, onDismiss, t }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  if (!items.length) return null;
  return (
    <section id="news" className="card" aria-label={items.some((n) => n.kind === "notice") ? t("news.titleNotices") : t("news.title")}>
      <h2 className="newsh">{items.some((n) => n.kind === "notice") ? t("news.titleNotices") : t("news.title")}</h2>
      <ul>
        {items.map((n) => {
          const notice = n.kind === "notice";
          const title = (lang === "pap" && n.title_pap) || n.title_en || (notice ? t(`notice.announced.${n.announced ?? "other"}` as never) : "");
          const body = (lang === "pap" && n.body_pap) || n.body_en;
          const expanded = open === n.id;
          return (
            <li key={n.id} className={`sev-${n.severity}${notice ? " kind-notice" : ""}${expanded ? " open" : ""}`}>
              <div className="nhead">
                {notice ? (
                  // the full label in the wide card; just the publisher on the narrow chip
                  <span className="ntag">
                    <span className="nfull">{t("notice.tag", { publisher: n.publisher ?? "" })}</span>
                    <span className="nshort" aria-hidden="true">
                      {n.publisher}
                    </span>
                  </span>
                ) : (
                  <span className="ntag">{t(`news.severity.${n.severity}`)}</span>
                )}
                <button type="button" className="ntitle" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : n.id)}>
                  {title}
                </button>
                <button type="button" className="nx" aria-label={t("news.dismiss", { title })} onClick={() => onDismiss(n.id)}>
                  ×
                </button>
              </div>
              <div className="nbody">
                <p>{body}</p>
                {notice && n.starts_local && (
                  <p className="nwhen">{t("notice.when", { when: eventPeriod(n.starts_local, n.ends_local, dates, (start, end) => t("events.range", { start, end })) })}</p>
                )}
                <p className="nmeta">
                  {notice ? t("notice.posted", { time: issuedShort(n.publishedAt, dates) }) : dayMonth(n.publishedAt, dates)}
                  {n.link && (
                    <>
                      {" · "}
                      <a href={n.link} target="_blank" rel="noopener noreferrer">
                        {notice ? t("notice.source") : t("news.link")}
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
