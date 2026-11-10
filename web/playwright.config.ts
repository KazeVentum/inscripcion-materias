import { defineConfig } from "@playwright/test";

/**
 * E2E contra el stack real (make up && make seed). La app se sirve en WEB_URL
 * (por defecto http://localhost:3000); no se levanta un servidor propio.
 * Los estudiantes de demo comparten estado en Redis/Mongo: los tests corren en serie.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: process.env.WEB_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    locale: "es-CO",
    timezoneId: "America/Bogota",
  },
  projects: [
    {
      name: "movil",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
      testMatch: /movil\.spec\.ts/,
    },
    {
      name: "escritorio",
      use: { viewport: { width: 1440, height: 900 } },
      testMatch: /(?<!movil)\.spec\.ts$/,
    },
  ],
});
