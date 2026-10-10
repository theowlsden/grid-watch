import type { DateNames } from "@/lib/time";
import type { GridEvent } from "@/lib/schema";
import { eventDate, eventRange } from "@/lib/time";
import type { Translate } from "@/i18n";

// Reported events (spec 4.6). Only events with a public source are published, so every entry
// links to its source. Titles and source names stay in their original language.
function EventItem({ e, dates, t }: { e: GridEvent; dates: DateNames; t: Translate }) {
  const when =
    e.end_local && e.end_local.slice(0, 10) !== e.start_local.slice(0, 10)
      ? eventRange(e.start_local, e.end_local, dates, (start, end) => t("events.range", { start, end }))
      : eventDate(e.start_local, dates);
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

/** Shown instead of the events while that section is switched off (EVENTS_ENABLED): the
 *  footnote of spec 4.6 still has to be reachable on phones and tablets. */
export function LimitsNote({ t, onClose }: { t: Translate; onClose: () => void }) {
  return (
    <div className="evhead">
      <p className="sub limits">{t("events.cannotShow")}</p>
      <button type="button" className="x" aria-label={t("limits.close")} onClick={onClose}>
        ×
      </button>
    </div>
  );
}

export function EventsList({ events, dates, t, onClose }: { events: GridEvent[]; dates: DateNames; t: Translate; onClose?: () => void }) {
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
            <EventItem key={e.id} e={e} dates={dates} t={t} />
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
