import type { GridEvent } from "@/lib/schema";
import { eventDate, eventRange } from "@/lib/time";
import type { Translate } from "@/i18n";

// Reported events (spec 4.6). Only events with a public source are published, so every entry
// links to its source. Titles and source names stay in their original language.
function EventItem({ e, locale, t }: { e: GridEvent; locale: string; t: Translate }) {
  const when =
    e.end_local && e.end_local.slice(0, 10) !== e.start_local.slice(0, 10)
      ? eventRange(e.start_local, e.end_local, locale, (start, end) => t("events.range", { start, end }))
      : eventDate(e.start_local, locale);
  const src = e.sources.find((s) => /^https:\/\//.test(s.url));
  return (
    <li className={e.severity === "minor" ? "minor" : undefined}>
      <time dateTime={e.start_local}>{when}</time>
      <strong>{e.title ?? t(`events.type.${e.type}`)}</strong>
      <p>{e.summary}</p>
      {src ? (
        <a className="src" href={src.url} target="_blank" rel="noopener noreferrer">
          {t("events.source", { publisher: src.publisher })}
        </a>
      ) : (
        <span className="src missing">{t("events.sourceMissing")}</span>
      )}
    </li>
  );
}

export function EventsList({ events, locale, t, onClose }: { events: GridEvent[]; locale: string; t: Translate; onClose?: () => void }) {
  return (
    <>
      <div className="evhead">
        <h2 className="evh">{t("events.title")}</h2>
        {onClose && (
          <button type="button" className="x" aria-label={t("events.close")} onClick={onClose}>
            ×
          </button>
        )}
      </div>
      <p className="sub">{t("events.intro")}</p>
      {events.length ? (
        <ol className="evl">
          {events.map((e) => (
            <EventItem key={e.id} e={e} locale={locale} t={t} />
          ))}
        </ol>
      ) : (
        // only sourced events are published (spec 4.6); until the first one, say why the list is empty
        <p className="evl-empty">{t("events.empty")}</p>
      )}
      <p className="sub">{t("events.cannotShow")}</p>
    </>
  );
}
