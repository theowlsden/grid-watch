"use client";
import type { DateNames } from "@/lib/time";
import { useRef } from "react";
import type { ForecastDay } from "@/lib/schema";
import { LEVEL_THRESHOLDS, toneOfLevel } from "@/lib/levels";
import { weekdayShort } from "@/lib/time";
import type { Translate } from "@/i18n";
import { dayAriaLabel, onDayKey } from "./dayLabel";

const LEGEND = [
  ["ok", "level.low"],
  ["watch", "level.moderate"],
  ["warn", "level.elevated"],
  ["crit", "level.high"],
  ["unknown", "level.unknown"],
] as const;

// Lollipop chart of the stress index; it is also the day picker in the wide layout (spec 4.1).
export function WeekChart({
  days,
  selected,
  onSelect,
  dates,
  t,
  footnote = null,
}: {
  days: ForecastDay[];
  selected: number;
  onSelect: (i: number) => void;
  dates: DateNames;
  t: Translate;
  footnote?: string | null;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <section id="week" className="card">
      <div className="wh">
        <h2>{t("week.title")}</h2>
        <div className="legend" role="list" aria-label={t("week.legend")}>
          {LEGEND.map(([tone, key]) => (
            <span role="listitem" key={tone}>
              <i className={`lg-${tone}`} aria-hidden="true" />
              {t(key)}
            </span>
          ))}
        </div>
        <span className="sub">{t("week.pick")}</span>
      </div>
      <div id="plot">
        <div className="grid" aria-hidden="true">
          {LEVEL_THRESHOLDS.map((th) => (
            <div key={th.level} className="gl" style={{ "--p": th.from } as React.CSSProperties}>
              <span>{t("week.threshold", { level: t(`level.${th.level}`), value: th.from })}</span>
            </div>
          ))}
        </div>
        <div className="cols">
          {days.map((d, i) => (
            <button
              key={d.date}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              className={`col ${toneOfLevel(d.level)}`}
              aria-pressed={i === selected}
              aria-label={dayAriaLabel(d, dates, t)}
              style={{ "--p": d.index } as React.CSSProperties}
              onClick={() => onSelect(i)}
              onKeyDown={(e) => onDayKey(e, i, days.length, onSelect, (j) => refs.current[j]?.focus())}
            >
              <i className="stem" />
              <i className="dot" />
              <span className="tip">{d.index}</span>
              <span className="lab">{weekdayShort(d.date, dates)}</span>
            </button>
          ))}
        </div>
      </div>
      {footnote && <p className="sub weeknote">{footnote}</p>}
    </section>
  );
}
