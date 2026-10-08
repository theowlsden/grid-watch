import type { ForecastDay } from "@/lib/schema";
import { demandTone, windTone, windWord } from "@/lib/levels";
import type { Translate } from "@/i18n";
import { Icon } from "./Icons";

// Stacked stat tiles in the wide layout's left column (spec 4.1).
export function StatTiles({ day, t }: { day: ForecastDay; t: Translate }) {
  const d = day.drivers;
  const demand = t(`demand.${d.demand}`);
  return (
    <div id="stats">
      <div className="stat card">
        <div className="si">{Icon.wind}</div>
        <div className="sv">
          {d.wind_ms_100m.toFixed(1)}
          <small>m/s</small>
        </div>
        <div className="sl">{t("stat.wind.label")}</div>
        <span className={`chip ${windTone(d.wind_ms_100m)}`}>{t(`wind.${windWord(d.wind_ms_100m)}`)}</span>
      </div>
      <div className="stat card">
        <div className="si">{Icon.heat}</div>
        <div className="sv">
          {Math.round(d.temp_c)}
          <small>°C</small>
        </div>
        <div className="sl">{t("stat.heat.label")}</div>
        <span className={`chip ${demandTone(d.demand)}`}>{t("stat.heat.chip", { demand })}</span>
      </div>
      <div className="stat card">
        <div className="si">{Icon.unknown}</div>
        <div className="sv">{t("stat.capacity.value")}</div>
        <div className="sl">{t("stat.capacity.label")}</div>
        <span className="chip">{t("stat.capacity.chip")}</span>
      </div>
    </div>
  );
}
