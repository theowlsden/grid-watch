import { expect, test } from "@playwright/test";
import { CONFIDENCE_BEST, shownConfidence } from "../../src/lib/levels";
import { readStressConfig } from "../../src/lib/model";

// Decision 23: the weather-forecast grade is capped while the rules are uncalibrated.
test("the site's cap matches the pipeline's", () => {
  expect(readStressConfig().confidence.best ?? "high").toBe(CONFIDENCE_BEST);
});

test("an older file saying high is shown as the cap", () => {
  expect(shownConfidence("high")).toBe(CONFIDENCE_BEST);
  expect(shownConfidence("low")).toBe("low");
});
