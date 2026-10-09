"use client";
import type { DateNames } from "@/lib/time";
import { useRef } from "react";
import type { ForecastDay } from "@/lib/schema";
import { toneOfLevel } from "@/lib/levels";
import { dayOfMonth, weekdayShort } from "@/lib/time";
import type { Translate } from "@/i18n";
import { dayAriaLabel, onDayKey } from "./dayLabel";

// Seven-day strip pinned to the bottom outside the wide layout (spec 4.2).
export function DayStrip({ days, selected, onSelect, dates, t }: { days: ForecastDay[]; selected: number; onSelect: (i: number) => void; dates: DateNames; t: Translate }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <nav id="days" aria-label={t("days.nav")}>
      {days.map((d, i) => (
        <button
          key={d.date}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          className={toneOfLevel(d.level)}
          aria-pressed={i === selected}
          aria-label={dayAriaLabel(d, dates, t)}
          onClick={() => onSelect(i)}
          onKeyDown={(e) => onDayKey(e, i, days.length, onSelect, (j) => refs.current[j]?.focus())}
        >
          <span className="wd">{weekdayShort(d.date, dates)}</span>
          <span className="dn">{dayOfMonth(d.date)}</span>
          <span className="dp">{d.index}</span>
        </button>
      ))}
    </nav>
  );
}
