"use client";
import Link from "next/link";
import { DocLangSwitch } from "./DocLangSwitch";
import { useEffect, useState } from "react";
import { coverage, type Lang, type MessageKey } from "@/i18n";
import { useTranslator } from "@/i18n/use";
import { runtimeConfig } from "@/lib/config";

const REPO = "https://github.com/theowlsden/grid-watch";
// the minimal set, in order of what it would add (decision 27)
const ITEMS = ["events", "load", "available", "wind", "maintenance"] as const;

// One language of the "data that would help" page: what public data would make the outlook
// testable, and how it could be shared. Built with every language, like the methodology page.
export function DataBody({ lang }: { lang: Lang }) {
  const { t } = useTranslator(lang);
  // the report form is linked only while it is open (TURNSTILE_SITEKEY)
  const [report, setReport] = useState(false);
  useEffect(() => {
    runtimeConfig().then((c) => setReport(!!c.cmsOrigin && !!c.turnstile));
  }, []);
  return (
    <main className="doc" lang={lang} data-doc-lang={lang}>
      <div className="doc-top">
        <Link href="/">← {t("method.back")}</Link>
        <DocLangSwitch t={t} />
      </div>
      {lang !== "en" && coverage(lang, "data.") < 0.95 && <p className="sub">{t("data.papPending")}</p>}
      <h1>{t("data.title")}</h1>
      <p className="lead">{t("data.intro")}</p>

      <h2>{t("data.now.h")}</h2>
      <p>{t("data.now.p")}</p>

      <h2>{t("data.ask.h")}</h2>
      <p>{t("data.ask.p")}</p>
      <ol className="datalist">
        {ITEMS.map((id) => (
          <li key={id}>
            <h3>{t(`data.item.${id}.h` as MessageKey)}</h3>
            <p>{t(`data.item.${id}.show` as MessageKey)}</p>
            <p className="sub">{t(`data.item.${id}.now` as MessageKey)}</p>
          </li>
        ))}
      </ol>
      <p>{t("data.extra.p")}</p>

      <h2>{t("data.form.h")}</h2>
      <ul>
        {(["file", "fields", "licence", "corrections"] as const).map((k) => (
          <li key={k}>{t(`data.form.${k}`)}</li>
        ))}
      </ul>

      <h2>{t("data.safety.h")}</h2>
      <p>{t("data.safety.p")}</p>

      <h2>{t("data.help.h")}</h2>
      <p>
        {t("data.help.p")}{" "}
        <a href={`${REPO}/issues/new/choose`} target="_blank" rel="noopener noreferrer">
          {t("data.help.issue")}
        </a>
      </p>
      {report && (
        <p>
          {t("data.help.report")} <Link href="/report">{t("report.link")} →</Link>
        </p>
      )}

      <p>
        <Link href="/methodology">{t("method.link")} →</Link>
      </p>
      <p className="credit">{t("app.credit")}</p>
    </main>
  );
}
