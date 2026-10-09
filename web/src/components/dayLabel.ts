import type { DateNames } from "@/lib/time";
import type { ForecastDay } from "@/lib/schema";
import { dayOfMonth, monthLong, weekdayLong } from "@/lib/time";
import type { Translate } from "@/i18n";

// "Saturday 10 October, stress index 67, High" (spec 4.8)
export function dayAriaLabel(d: ForecastDay, dates: DateNames, t: Translate): string {
  return t("day.aria", {
    weekday: weekdayLong(d.date, dates),
    day: dayOfMonth(d.date),
    month: monthLong(d.date, dates),
    index: d.index,
    level: t(`level.${d.level}`),
  });
}

// Arrow keys move between days (spec 4.8).
export function onDayKey(e: React.KeyboardEvent, current: number, count: number, select: (i: number) => void, focus: (i: number) => void) {
  const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
  const to = e.key === "Home" ? 0 : e.key === "End" ? count - 1 : current + step;
  if ((step || e.key === "Home" || e.key === "End") && to >= 0 && to < count) {
    e.preventDefault();
    select(to);
    focus(to);
  }
}
