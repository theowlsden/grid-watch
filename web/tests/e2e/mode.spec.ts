import { expect, test, open } from "./helpers";

// Spec 4.3, 11: Auto follows the clock (day 06:00 to 18:00), explicit choices persist.

for (const [time, mode] of [
  ["05:59", "night"],
  ["06:00", "day"],
  ["17:59", "day"],
  ["18:00", "night"],
] as const) {
  test(`auto at ${time} is ${mode}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date(`2026-10-08T${time}:00-04:00`));
    await open(page, { webgl: false });
    await expect(page.locator("html")).toHaveAttribute("data-mode", mode);
  });
}

for (const [choice, time] of [
  ["Day", "23:00"],
  ["Night", "12:00"],
] as const) {
  test(`explicit ${choice} persists across reload`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(new Date(`2026-10-08T${time}:00-04:00`));
    await open(page, { webgl: false });
    await page.locator("#topbar").getByRole("button", { name: choice }).click();
    const mode = choice.toLowerCase();
    await expect(page.locator("html")).toHaveAttribute("data-mode", mode);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-mode", mode);
    await expect(page.locator("#topbar").getByRole("button", { name: choice })).toHaveAttribute("aria-pressed", "true");
  });
}

test("works when storage is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("blocked");
      },
    });
  });
  await page.clock.setFixedTime(new Date("2026-10-08T12:00:00-04:00"));
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, { webgl: false });
  await page.locator("#topbar").getByRole("button", { name: "Night" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "night");
});
