import { expect, test } from "@playwright/test";
import en from "../../src/i18n/en.json";
import pap from "../../src/i18n/pap.json";
import { dateNames, translator, type MessageKey } from "../../src/i18n";
import { dateMedium, eventRange, issuedShort } from "../../src/lib/time";

test("Papiamentu uses its own text where it has one, English otherwise, never a key name", () => {
  const t = translator("pap");
  const own = pap as Partial<Record<MessageKey, string>>;
  for (const k of Object.keys(en) as MessageKey[]) {
    if (k.startsWith("date.")) continue; // lists are checked below
    expect(t(k), k).toBe(own[k] || en[k]);
  }
  expect(translator("en")("week.threshold", { level: "High", value: 60 })).toBe("High from 60");
});

test("date names come from the messages and are complete", () => {
  for (const lang of ["en", "pap"] as const) {
    const n = dateNames(lang);
    expect(n.daysShort).toHaveLength(7);
    expect(n.monthsLong).toHaveLength(12);
  }
});

test("dates are formatted in Curaçao time with the message names", () => {
  const n = dateNames("en");
  expect(dateMedium("2026-10-07", n)).toBe("Wed 7 Oct 2026");
  // 02:30 UTC on 10 Oct is still 9 Oct at 22:30 in Curaçao
  expect(issuedShort("2026-10-10T02:30:00Z", n)).toBe("9 Oct 22:30");
  expect(eventRange("2026-04-25", "2026-04-26", n, (a, b) => `${a} to ${b}`)).toBe("25 to 26 Apr 2026");
  expect(eventRange("2026-08-30", "2026-09-02", n, (a, b) => `${a} to ${b}`)).toBe("30 Aug to 2 Sep 2026");
  expect(eventRange("2025-12-31", "2026-01-01", n, (a, b) => `${a} to ${b}`)).toBe("31 Dec 2025 to 1 Jan 2026");
});
