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
    "dist/**",
    ".vinext/**",
    ".wrangler/**",
    "worker-configuration.d.ts",
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
    "public/simulator/core/**",
    "experience/site/dist/**",
    "experience/.wrangler/**",
  ]),

  /**
   * The typography rule from `CLAUDE.md`, enforced: no uppercase transform
   * and no letter-spacing, anywhere. Class strings are the way both would
   * arrive in a React tree, so string literals and template literals are
   * checked for the Tailwind utilities, and the SVG attribute is checked by
   * name. The stylesheet is checked by hand; ESLint does not read CSS.
   */
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/(^|[\\s:])(uppercase|lowercase|capitalize|normal-case|tracking-[a-z0-9\\[\\]\\-]+)([\\s]|$)/]",
          message:
            "Type is set at its natural case and spacing: no uppercase, no tracking-* (see CLAUDE.md).",
        },
        {
          selector:
            "TemplateElement[value.raw=/(^|[\\s:])(uppercase|lowercase|capitalize|normal-case|tracking-[a-z0-9\\[\\]\\-]+)([\\s]|$)/]",
          message:
            "Type is set at its natural case and spacing: no uppercase, no tracking-* (see CLAUDE.md).",
        },
        {
          selector: "JSXAttribute[name.name='letterSpacing']",
          message: "No letter-spacing, in SVG either (see CLAUDE.md).",
        },
      ],
    },
  },

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
              group: [
                "**/convex/moderation/*",
                "**/convex/moderation",
                "@convex/moderation/*",
                "@convex/moderation",
              ],
              message:
                "The moderation rules are server-side only and must never reach a browser bundle. Anything the client needs comes through convex/_generated/api — see src/lib/chat.ts.",
              allowTypeImports: false,
            },
            {
              group: ["**/convex/chat/*", "@convex/chat/*"],
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
