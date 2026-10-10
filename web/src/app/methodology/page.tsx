import type { Metadata } from "next";
import { LANGS } from "@/i18n";
import { MethodologyBody as Body } from "@/components/MethodologyBody";
import { readStressConfig } from "@/lib/model";

export const metadata: Metadata = {
  title: "How Grid Watch works",
  description: "The rules, inputs and limits behind the Grid Watch Curaçao stress outlook.",
};

// Methodology and limits (spec 8.2). Numbers come from pipeline/stress_config.yaml at build time.
// The static page holds every language; CSS shows the one matching <html lang>, which
// mode-init.js sets from the visitor's choice before first paint.
export default function Methodology() {
  const c = readStressConfig();
  return (
    <div className="doc-page">
      {LANGS.map((lang) => (
        <Body key={lang} lang={lang} c={c} />
      ))}
    </div>
  );
}
