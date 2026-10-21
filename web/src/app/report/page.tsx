import type { Metadata } from "next";
import { ReportForm } from "@/components/ReportForm";

export const metadata: Metadata = {
  title: "Report a power cut: Grid Watch Curaçao",
  description: "Report an outage, load shedding or a utility notice in Curaçao. Reviewed before anything is published.",
};

// The public report form (decision 26); it only opens once TURNSTILE_SITEKEY is set.
export default function Report() {
  return (
    <div className="doc-page">
      <ReportForm />
    </div>
  );
}
