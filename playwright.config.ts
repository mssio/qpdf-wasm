import { defineConfig, devices } from "@playwright/test";

const reuseExistingServer = !process.env.CI;

export default defineConfig({
  testDir: "test/browser",
  testMatch: "*.spec.ts",
  timeout: 120_000,
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: [
    {
      command: "node scripts/serve-static.mjs 4301 test/browser/fixtures/vite-app/dist",
      url: "http://localhost:4301/",
      reuseExistingServer,
    },
    {
      command: "node scripts/serve-static.mjs 4302 test/browser/fixtures/webpack-app test/fixtures",
      url: "http://localhost:4302/",
      reuseExistingServer,
    },
    {
      command: "npm --prefix test/browser/fixtures/vite-app run dev",
      url: "http://localhost:4303/",
      reuseExistingServer,
    },
  ],
});
