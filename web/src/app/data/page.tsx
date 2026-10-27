import type { Metadata } from "next";
import { LANGS } from "@/i18n";
import { DataBody } from "@/components/DataBody";

export const metadata: Metadata = {
  title: "The data that would help: Grid Watch Curaçao",
  description: "A minimal set of public grid data that would let anyone check the Grid Watch outlook against what happened.",
};

// What data would make the outlook testable (decision 27). Like the methodology page, the static
// page holds every language and CSS shows the chosen one.
export default function Data() {
  return (
    <div className="doc-page">
      {LANGS.map((lang) => (
        <DataBody key={lang} lang={lang} />
      ))}
    </div>
  );
}
