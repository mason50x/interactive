import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./scripts/e2e",
  use: { baseURL: "http://localhost:3100" },
  webServer: {
    command: "npm start -- --port 3100",
    url: "http://localhost:3100",
    // Inert fixture; no account access.
    env: process.env.CI ? { CLERK_SECRET_KEY: "sk_test_ci_placeholder" } : {},
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
