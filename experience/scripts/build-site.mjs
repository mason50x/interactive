#!/usr/bin/env node
/**
 * Assemble site/dist: our files plus the three vendored client bundles, laid
 * out under names of our own.
 *
 *   /                 site/index.html, sw.js, _headers
 *   /engine/          the rewriting engine (bundle, handler, client, sw), with
 *                     our config as config.js
 *   /bridge/          the transport switchboard (index.js, worker.js)
 *   /transport/       the Bare v3 client (index.mjs)
 *
 * The output is gitignored and rebuilt by `npm run build`, `dev`, and
 * `deploy`, so the vendored code is always whatever package-lock.json says.
 */

import { copyFileSync, cpSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "site", "dist");
const modules = join(root, "node_modules");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const name of readdirSync(join(root, "site"))) {
  if (name === "dist" || name === "engine.config.js") continue;
  cpSync(join(root, "site", name), join(dist, name), { recursive: true });
}

// The engine, file by file, under our names. Its stock config is skipped and
// ours copied in its place; the config names every one of these paths.
const engineSrc = join(modules, "@titaniumnetwork-dev", "ultraviolet", "dist");
mkdirSync(join(dist, "engine"));
for (const [from, to] of [
  ["uv.bundle.js", "bundle.js"],
  ["uv.handler.js", "handler.js"],
  ["uv.client.js", "client.js"],
  ["uv.sw.js", "sw.js"],
]) {
  copyFileSync(join(engineSrc, from), join(dist, "engine", to));
}
copyFileSync(join(root, "site", "engine.config.js"), join(dist, "engine", "config.js"));

const noMaps = { recursive: true, filter: (src) => !/\.(map|d\.ts)$/.test(src) };
cpSync(join(modules, "@mercuryworkshop", "bare-mux", "dist"), join(dist, "bridge"), noMaps);
cpSync(join(modules, "@mercuryworkshop", "bare-as-module3", "dist"), join(dist, "transport"), noMaps);

console.log(`built ${dist}`);
