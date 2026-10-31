import path from "node:path";
import { defineConfig } from "@playwright/test";
import { API_PORT, MONGO_URI, WEB_PORT, assertLocalMongo } from "./support/env";

// Refuse to even start the servers against anything but the local throwaway database.
assertLocalMongo();

const root = path.resolve(import.meta.dirname, "..");

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  // One shared store, one story: the tests build on each other, in order.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: path.join(root, "playwright-report") }]],
  outputDir: path.join(root, "test-results"),
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    // The installed Chrome — no separate browser download needed.
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: [
    {
      // The real API, on its own port, against the throwaway database. Env set
      // here wins over .env (dotenv never overrides an existing variable).
      command: "node server/index.js",
      cwd: root,
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 90_000,
      env: { PORT: String(API_PORT), MONGODB_URI: MONGO_URI, NODE_ENV: "development" },
    },
    {
      // The real web app, proxying /api to the API above.
      command: "npx vite",
      cwd: root,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 90_000,
      env: { PORT: String(API_PORT), WEB_PORT: String(WEB_PORT) },
    },
  ],
});
