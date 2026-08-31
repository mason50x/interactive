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

  /**
   * The wall between the browser bundle and the moderation rules.
   *
   * Everything under `convex/moderation/` — the word lists, the patterns, the
   * thresholds — is bundled by Convex for its own runtime and by nothing else.
   * Two reasons it has to stay that way, and the second is the one that
   * matters: a list of slurs in a public chunk is a list of slurs anybody can
   * read, and a filter you can read is a filter you can walk around at leisure.
   *
   * `src/` reaches Convex through `convex/_generated/api`, which is names and
   * types and no bodies. That is enough for everything the client legitimately
   * needs, including the refusal type — see `src/lib/chat.ts`, which derives it
   * from the mutation's return type rather than importing it.
   *
   * `convex/chat/**` is a softer line: type-only imports are allowed, because
   * the result shapes are exported from those modules on purpose and `import
   * type` is erased before anything is bundled. A value import would pull the
   * server code in, and it is banned.
   */
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/convex/moderation/*", "**/convex/moderation"],
              message:
                "The moderation rules are server-side only and must never reach a browser bundle. Anything the client needs comes through convex/_generated/api — see src/lib/chat.ts.",
              allowTypeImports: false,
            },
            {
              group: ["**/convex/chat/*"],
              message:
                "Import only types from convex/chat — a value import bundles the server code with it.",
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
