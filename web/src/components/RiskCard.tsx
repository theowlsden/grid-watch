import type { Forecast, ForecastDay } from "@/lib/schema";
import { demandTone, toneOfLevel, windTone, windWord, type Tone } from "@/lib/levels";
import { dateMedium } from "@/lib/time";
import type { Translate } from "@/i18n";
import { Mascot } from "./Mascot";

interface Props {
  forecast: Forecast;
  day: ForecastDay;
  locale: string;
  t: Translate;
}

// The main readout (#hud). Shows a 0 to 100 stress index and level, never a probability (spec 5.1).
export function RiskCard({ forecast, day, locale, t }: Props) {
  const tone = toneOfLevel(day.level);
  const d = day.drivers;
  const drivers: [string, string, Tone][] = [
    [t("driver.wind"), t(`wind.${windWord(d.wind_ms_100m)}`), windTone(d.wind_ms_100m)],
    [t("driver.heat"), `${Math.round(d.temp_c)}°C`, demandTone(d.demand)],
    [t("driver.demand"), t(`demand.${d.demand}`), demandTone(d.demand)],
    [t("driver.capacity"), t("driver.unknown"), "unknown"],
  ];
  return (
    <section id="hud" className="card" aria-labelledby="hud-when">
      <div className="top">
        <Mascot tone={tone} />
        <div className="ttl">
          {forecast.data_mode === "example" && <span className="tag">{t("tag.example")}</span>}
          <div className="when" id="hud-when">
            {t("risk.window", { date: dateMedium(day.date, locale), start: forecast.window_local.start, end: forecast.window_local.end })}
          </div>
        </div>
      </div>
      <div className="readout">
        <span className="pct">
          {day.index}
          <small className="scale">{t("risk.scale")}</small>
        </span>
        <span className={`pill ${tone}`}>{t(`level.${day.level}`)}</span>
        <span className="conf">{t("confidence.label", { level: t(`confidence.${day.confidence}`) })}</span>
      </div>
      <p className="sub">{t("risk.explain")}</p>
      <ul className="drivers">
        {drivers.map(([k, v, tn]) => (
          <li key={k} className={`t-${tn}`}>
            {k} <b>{v}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}
