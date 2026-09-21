import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import commonjs from "vite-plugin-commonjs";
import { fileURLToPath } from "node:url";

export default defineConfig(({ command }) => ({
  optimizeDeps: {
    // Base UI is excluded below, but its CommonJS hook dependency still needs
    // pre-bundling to expose named exports to browser ES modules.
    include: [
      "use-sync-external-store/shim",
      "use-sync-external-store/shim/with-selector",
    ],
    // RSC client boundaries load Clerk directly. Keep hooks on the same module
    // instances instead of creating a second context in the optimized bundle.
    exclude: [
      "@clerk/nextjs",
      "@clerk/react",
      "@clerk/shared",
      // Clerk telemetry imports this alias; prebundling it duplicates React.
      "next/compat/router",
      "vinext",
      "@base-ui/react",
    ],
  },
  environments: {
    rsc: { optimizeDeps: { exclude: ["vinext", "@base-ui/react"] } },
    ssr: { optimizeDeps: { exclude: ["vinext", "@base-ui/react"] } },
  },
  resolve: {
    alias: {
      // Use Clerk's original CommonJS helper, rather than its partially
      // converted ESM wrapper, so the converter can handle it consistently.
      "#safe-node-apis": fileURLToPath(
        new URL(
          "./node_modules/@clerk/nextjs/dist/cjs/runtime/node/safe-node-apis.js",
          import.meta.url,
        ),
      ),
    },
  },
  plugins: [
    // Clerk's ESM distribution still contains require() calls in its server
    // helpers and sign-in routing hooks. Convert these for both runtimes.
    commonjs({
      filter: (id) =>
        id.includes("/node_modules/@clerk/nextjs/dist/") &&
        !id.includes("/esm/runtime/"),
    }),
    vinext(),
    cloudflare({
      // Vite must serve its own modules and styles before the app worker.
      // Production still runs the worker first to enforce the response policy.
      ...(command === "serve"
        ? {
            config: { assets: { run_worker_first: false } },
          }
        : {}),
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
}));
