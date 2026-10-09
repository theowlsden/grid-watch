import type { DateNames } from "@/lib/time";
import type { Forecast, ForecastDay, Site } from "@/lib/schema";
import { FLEET } from "@/lib/fleet";
import { siteView, windWordOf } from "@/lib/view";
import { weekdayShort } from "@/lib/time";
import type { Translate } from "@/i18n";
import { Icon } from "./Icons";

interface Props {
  site: Site;
  name: string;
  forecast: Forecast;
  day: ForecastDay;
  dates: DateNames;
  t: Translate;
  onClose: () => void;
}

function Tile({ b, s }: { b: string; s: string }) {
  return (
    <div className="tile">
      <b>{b}</b>
      <span>{s}</span>
    </div>
  );
}

// Site info card (spec 4.5): estimates say "estimated" and how; utility-only facts say "not public".
export function SiteCard({ site, name, forecast, day, dates, t, onClose }: Props) {
  const v = siteView(site, day);
  const wind = site.kind === "wind";
  const parks = site.parks ?? [];
  const kind = wind ? t(parks.length > 1 ? "site.kind.wind_many" : "site.kind.wind") : t(site.kind === "thermal" ? "site.kind.thermal" : "site.kind.other");
  const status = !v.hasData ? t("site.noData") : wind ? t("site.status.wind", { word: t(`wind.${windWordOf(day)}`) }) : t("site.status.thermal");
  const out = v.estOutputPct ?? day.drivers.wind_output_pct_est;
  return (
    <>
      <div className="head">
        <div className="ic">{wind ? Icon.wind : Icon.thermal}</div>
        <div className="hd">
          <div className="kind">{kind}</div>
          <h2 id="card-title">{name}</h2>
        </div>
        <button type="button" className="x" aria-label={t("site.close")} onClick={onClose}>
          ×
        </button>
      </div>
      <div>
        <span className={`pill ${v.tone === "unknown" ? "" : v.tone}`}>{status}</span>
      </div>
      {parks.length > 0 && (
        <p className="parks">
          {t("site.parks", { names: parks.join(", ") })}
        </p>
      )}
      {wind && v.hasData && (
        <div>
          <div className="pr">
            <span>{t("site.wind.output")}</span>
            <span>~{out}%</span>
          </div>
          <div className="bar" role="presentation">
            <i style={{ width: `${out}%` }} />
          </div>
        </div>
      )}
      <div className="tiles">
        {wind ? (
          <>
            <Tile
              b={t("site.wind.tile", { value: day.drivers.wind_ms_100m.toFixed(1) })}
              s={t(forecast.data_mode === "example" ? "site.wind.tileSub.example" : "site.wind.tileSub.live", { weekday: weekdayShort(day.date, dates) })}
            />
            <Tile b={t("site.wind.fleet", { mw: FLEET.wind_mw })} s={t("site.wind.fleetSub", { year: FLEET.year })} />
          </>
        ) : (
          <>
            <Tile b={t("site.thermal.units")} s={t("site.thermal.unitsSub")} />
            <Tile b={t("site.thermal.fleet", { mw: FLEET.conventional_mw })} s={t("site.thermal.fleetSub", { year: FLEET.year })} />
          </>
        )}
      </div>
      <p className="note">
        {wind ? t("site.wind.note") : t("site.thermal.note")}
        {site.placement === "approximate" && ` ${t("site.approximate")}`}
      </p>
    </>
  );
}
