import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The three import aliases `tsconfig.json` declares, spelled out again here
 * because Vite resolves imports itself and does not read `paths`. A test
 * that imports a module under `src/` pulls in whatever that module imports,
 * so the aliases have to resolve here for the same reason they do in Next.
 */
const root = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@/": root("./src/"),
      "@convex/": root("./convex/"),
      "@config/": root("./config/"),
    },
  },
  test: { include: ["scripts/tests/*.test.ts"], environment: "node" },
});
