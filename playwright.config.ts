import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./scripts/e2e",
  use: { baseURL: "http://localhost:8787" },
  webServer: {
    command: process.env.CI
      ? "npm start -- --port 8787 --var CLERK_SECRET_KEY:sk_test_ci_placeholder" // inert fixture; no account access
      : "npm start -- --port 8787",
    url: "http://localhost:8787",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
