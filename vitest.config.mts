import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["scripts/tests/simulator*.test.ts"], environment: "node" },
});
