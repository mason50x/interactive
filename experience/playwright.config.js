import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: { baseURL: "http://localhost:8788" },
  webServer: {
    command: "npm run dev -- --port 8788",
    url: "http://localhost:8788",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
