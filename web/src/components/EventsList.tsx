import type { DateNames } from "@/lib/time";
import type { GridEvent } from "@/lib/schema";
import { eventDate, eventPeriod } from "@/lib/time";
import Link from "next/link";
import type { CommunityDay } from "@/lib/community";
import type { Lang, Translate } from "@/i18n";

// An event with a start time and no end: "Ongoing" for 12 hours, then "End time not reported",
// so the site never claims something is still happening a day later (decision 25). A date-only
// event without an end is a past single-day event and gets no status.
export const ONGOING_FOR_MS = 12 * 3600_000;

export function eventStatus(e: GridEvent, now: number): "ongoing" | "endUnknown" | null {
  if (e.end_local || e.start_local.length <= 10) return null;
  const started = Date.parse(e.start_local);
  if (Number.isNaN(started) || started > now) return null;
  return now - started < ONGOING_FOR_MS ? "ongoing" : "endUnknown";
}

/** Ongoing events first, then newest first. */
export function sortEvents(events: GridEvent[], now: number): GridEvent[] {
  const rank = (e: GridEvent) => (eventStatus(e, now) === "ongoing" ? 0 : 1);
  return [...events].sort((a, b) => rank(a) - rank(b) || b.start_local.localeCompare(a.start_local));
}

// Reported events (spec 4.6). Only events with a public source are published, so every entry
// links to its source. Titles and source names stay in their original language.
function EventItem({ e, dates, t, lang, now }: { e: GridEvent; dates: DateNames; t: Translate; lang: Lang; now: number }) {
  const status = eventStatus(e, now);
  // while ongoing only the date is shown; the times appear once the end is known
  const when = status === "ongoing" ? eventPeriod(e.start_local.slice(0, 10), null, dates, (a) => a) : eventPeriod(e.start_local, e.end_local, dates, (start, end) => t("events.range", { start, end }));
  const src = e.sources.find((s) => /^https:\/\//.test(s.url));
  const scope = e.scope === "island" ? t("events.scope.island") : e.scope === "areas" && e.areas?.length ? e.areas.join(", ") : null;
  const cause = e.cause === "supply" || e.cause === "network" ? t(`events.cause.${e.cause}`) : null;
  return (
    <li className={[e.severity === "minor" && "minor", status === "ongoing" && "ongoing"].filter(Boolean).join(" ") || undefined}>
      <div className="evwhen">
        <time dateTime={e.start_local}>{when}</time>
        {status && <span className={`evstatus ${status}`}>{t(status === "ongoing" ? "events.ongoing" : "events.endUnknown")}</span>}
      </div>
      <strong>{e.title ?? t(`events.type.${e.type}`)}</strong>
      {(scope || cause) && (
        <p className="evchips">
          {scope && <span>{scope}</span>}
          {cause && <span>{cause}</span>}
        </p>
      )}
      <p>{(lang === "pap" && e.summary_pap) || e.summary}</p>
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

export function EventsList({
  events,
  dates,
  t,
  lang = "en",
  now,
  onClose,
  community = [],
  canReport = false,
}: {
  events: GridEvent[];
  dates: DateNames;
  t: Translate;
  lang?: Lang;
  now: number; // the dashboard's clock, ticking every minute
  onClose?: () => void;
  community?: CommunityDay[]; // unverified community reports, grouped (decision 26)
  canReport?: boolean; // the public report form is open (TURNSTILE_SITEKEY)
}) {
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
          {sortEvents(events, now).map((e) => (
            <EventItem key={e.id} e={e} dates={dates} t={t} lang={lang} now={now} />
          ))}
        </ol>
      ) : (
        // only sourced events are published (spec 4.6); until the first one, say why the list is empty
        <p className="evl-empty">{t("events.empty")}</p>
      )}
      {canReport && (
        <p className="evreport">
          <Link href="/report">{t("report.link")} →</Link>
        </p>
      )}
      {community.length > 0 && (
        <section className="community" aria-labelledby="community-h">
          <h3 id="community-h">{t("community.h")}</h3>
          <p className="sub">{t("community.p")}</p>
          <ul>
            {community.map((d) => (
              <li key={d.date}>
                <strong>{t("community.day", { date: eventDate(d.date, dates), count: d.total })}</strong>
                {" · "}
                {[
                  ...d.areas.map((a) => `${a.name} (${a.count})`),
                  ...(d.island ? [t("community.island", { count: d.island })] : []),
                  ...(d.unknown ? [t("community.unknown", { count: d.unknown })] : []),
                ].join(", ")}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="sub">{t("events.cannotShow")}</p>
    </>
  );
}
