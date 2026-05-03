import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright smoke test configuration.
 *
 * For local development: set PARTICIPANT_HOST=localhost:3000 in your env
 * so the proxy allows participant routes through. The webServer block starts
 * a Next.js dev instance automatically if one isn't already running.
 *
 * For staging: set PLAYWRIGHT_BASE_URL to the participant base URL (e.g.
 * https://mrqlive.co.uk). The webServer block is skipped when a base URL
 * is provided externally.
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        env: {
          // Override to make the proxy treat localhost:3000 as the participant host.
          PARTICIPANT_HOST: "localhost:3000",
          ADMIN_HOST: "localhost:3001",
          NODE_ENV: "development",
        },
      },
});
