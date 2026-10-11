import type { Metadata } from "next";
import { LANGS } from "@/i18n";
import { ResultsBody } from "@/components/ResultsBody";

export const metadata: Metadata = {
  title: "Results: Grid Watch Curaçao",
  description: "A retrospective test of the Grid Watch stress rules on archived weather forecasts.",
};

// Results of the backtest (spec 5.3). Like the methodology page, the static page holds every
// language and CSS shows the chosen one. The numbers only appear once RESULTS_ENABLED is on.
export default function Results() {
  return (
    <div className="doc-page">
      {LANGS.map((lang) => (
        <ResultsBody key={lang} lang={lang} />
      ))}
    </div>
  );
}
