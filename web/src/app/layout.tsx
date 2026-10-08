import type { Metadata, Viewport } from "next";
import "@fontsource/baloo-2/600.css";
import "@fontsource/baloo-2/700.css";
import "@fontsource/baloo-2/800.css";
import "@fontsource/nunito/500.css";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grid Watch Curaçao",
  description:
    "Experimental research prototype: electricity supply stress outlook for Curaçao from public data. Not an operational utility forecast.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-mode="day" suppressHydrationWarning>
      <head>
        {/* sets data-mode before first paint; a file, not inline, so the CSP can forbid inline scripts */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- must run before first paint to avoid a day/night flash; tiny same-origin file */}
        <script src="/mode-init.js" />
      </head>
      <body>{children}</body>
    </html>
  );
}
