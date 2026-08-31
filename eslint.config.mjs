import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Convex codegen output.
    "convex/_generated/**",
    // Where scripts/build-catalogue.mjs stages the upstream archive: hundreds
    // of third-party bundles, minified and none of it ours to lint. It is
    // gitignored, which eslint does not read, so it has to be named here —
    // otherwise a lint run walks ~18,000 files and takes minutes.
    ".cache/**",
  ]),
]);

export default eslintConfig;
