"use client";
import { useEffect } from "react";
import { runtimeConfig } from "@/lib/config";

// Cloudflare Web Analytics (decision 22): cookieless page views, referrers, countries, device
// types and loading speed. Added only when ANALYTICS_TOKEN is set; the CSP allows exactly its
// script and reporting address (scripts/csp.mjs).
export const BEACON = "https://static.cloudflareinsights.com/beacon.min.js";

export function Analytics() {
  useEffect(() => {
    runtimeConfig().then(({ analytics }) => {
      if (!analytics || document.querySelector(`script[src="${BEACON}"]`)) return;
      const s = document.createElement("script");
      s.type = "module";
      s.src = BEACON;
      s.setAttribute("data-cf-beacon", JSON.stringify({ token: analytics }));
      document.head.appendChild(s);
    });
  }, []);
  return null;
}
