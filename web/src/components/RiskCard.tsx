import type { Forecast, ForecastDay } from "@/lib/schema";
import { demandTone, toneOfLevel, windTone, windWord, type Tone } from "@/lib/levels";
import { dateMedium, issuedShort } from "@/lib/time";
import type { Translate } from "@/i18n";
import Link from "next/link";
import { Mascot } from "./Mascot";

interface Props {
  forecast: Forecast;
  day: ForecastDay;
  stale: boolean;
  preview: boolean;
  locale: string;
  t: Translate;
}

// The main readout (#hud). Shows a 0 to 100 stress index and level, never a probability (spec 5.1).
export function RiskCard({ forecast, day, stale, preview, locale, t }: Props) {
  const tone = stale ? "unknown" : toneOfLevel(day.level);
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
          {preview && <span className="tag preview">{t("tag.preview")}</span>}
          {stale && <span className="tag stale">{t("risk.stale")}</span>}
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
        <span className={`pill ${tone}`}>{stale ? t("level.unknown") : t(`level.${day.level}`)}</span>
        <span className="conf">{t("confidence.label", { level: t(`confidence.${day.confidence}`) })}</span>
      </div>
      <p className="sub">
        {stale ? t("risk.staleExplain", { time: issuedShort(forecast.issued_at, locale) }) : t("risk.explain")}{" "}
        <Link className="methodlink" href="/methodology">
          {t("method.link")}
        </Link>
      </p>
      <ul className="drivers">
        {drivers.map(([k, v, tn]) => (
          <li key={k} className={`t-${tn}`}>
            {k} <b>{v}</b>
          </li>
        ))}
      </ul>
      {forecast.data_mode === "live" && (
        <p className="updated">
          {t("risk.updated", { time: issuedShort(forecast.issued_at, locale) })}
          {forecast.sources.map((s) => (
            <span key={s.url}>
              {" · "}
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                {s.name}
              </a>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
