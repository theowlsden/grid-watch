import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against the static export (spec 11). Run `npm run build` first;
// `npm run test:e2e` builds and tests in one go.
const PORT = 4173;
// E2E_BASE_URL runs the suite against an already running site (e.g. the web container).
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: external ?? `http://localhost:${PORT}`,
    timezoneId: "America/Curacao",
    locale: "en-GB",
    // stable frames: no bobbing, spinning or smoke (also what reduced-motion visitors get)
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    launchOptions: {
      // WebGL through SwiftShader on machines without a GPU (CI)
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  projects: [
    { name: "chromium", testDir: "tests/e2e", use: { ...devices["Desktop Chrome"] } },
    // plain TypeScript unit tests (no browser needed), e.g. the projection (spec 7.4)
    { name: "unit", testDir: "tests/unit" },
  ],
  webServer: external
    ? undefined
    : {
        command: `node tests/serve.mjs`,
        // a CMS origin that never resolves; tests serve it with page.route()
        env: { PORT: String(PORT), CMS_ORIGIN: "https://cms.grid.test" },
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
      },
});
