#!/usr/bin/env node
/**
 * Assemble site/dist: our files plus the three vendored client bundles, laid
 * out under names of our own.
 *
 *   /                 site/index.html, sw.js, _headers
 *   /experience/          the experience engine (bundle, handler, client, sw), with
 *                     our config as config.js
 *   /bridge/          the transport switchboard (index.js, worker.js)
 *   /transport/       the Bare v3 client (index.mjs)
 *
 * The output is gitignored and rebuilt by `npm run build`, `dev`, and
 * `deploy`, so the vendored code is always whatever package-lock.json says.
 */

import { copyFileSync, cpSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "site", "dist");
const modules = join(root, "node_modules");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const name of readdirSync(join(root, "site"))) {
  if (name === "dist" || name === "experience.config.js") continue;
  cpSync(join(root, "site", name), join(dist, name), { recursive: true });
}

// The engine, file by file, under our names. Its stock config is skipped and
// ours copied in its place; the config names every one of these paths.
const engineSrc = join(modules, "@titaniumnetwork-dev", "ultraviolet", "dist");
mkdirSync(join(dist, "experience"));
for (const [from, to] of [
  ["uv.bundle.js", "bundle.js"],
  ["uv.handler.js", "handler.js"],
  ["uv.client.js", "client.js"],
  ["uv.sw.js", "sw.js"],
]) {
  copyFileSync(join(engineSrc, from), join(dist, "experience", to));
}
copyFileSync(join(root, "site", "experience.config.js"), join(dist, "experience", "config.js"));

// The engine's CSS matcher consumes the outer ')' in var(--image,
// url()). That unbalances the stylesheet and drops thousands of YouTube's
// component rules. Apply the correction to the shared bundle so both service
// worker responses and dynamically inserted styles use the same matcher.
// Fail loudly on upstream changes rather than silently shipping a stale fix.
const bundlePath = join(dist, "experience", "bundle.js");
const bundle = readFileSync(bundlePath, "utf8");
const brokenUrlMatcher = String.raw`/url\(['"]?(.+?)['"]?\)/gm`;
const fixedUrlMatcher = String.raw`/url\(['"]?([^)]+?)['"]?\)/gm`;
if (bundle.split(brokenUrlMatcher).length !== 2) {
  throw new Error("Review the experience CSS compatibility patch for this engine version.");
}
// The parser embedded in the published engine rejects valid `for (const x of
// await of(...))` syntax. Its installed, pinned parser fixes
// this. Use it in both page and service-worker engines so a parse failure does
// not silently leave relative module imports pointing at the proxy root.
const parser = readFileSync(join(modules, "meriyah", "dist", "meriyah.umd.min.js"), "utf8");
writeFileSync(bundlePath, bundle.replace(brokenUrlMatcher, fixedUrlMatcher) + "\n" + parser + `
;self.Ultraviolet = class extends self.Ultraviolet {
  constructor(...args) {
    super(...args);
    this.js.parse = self.meriyah.parse;
  }
  // The rewriter emits (importingModuleUrl, specifier), but the bundled
  // method treats those arguments in reverse and imports the module itself.
  rewriteImport(base, specifier, meta = this.meta) {
    return this.rewriteUrl(specifier, { ...meta, base });
  }
};
`);

// Modern sites pass postMessage(message, { targetOrigin, transfer }). The
// engine only understands the older three-argument form and drops ports.
const clientPath = join(dist, "experience", "client.js");
let client = readFileSync(clientPath, "utf8");
for (const [before, after] of [
  ['this.ctx.worker?[n,i=[]]=e:[n,o,i=[]]=e;', 'this.ctx.worker?[n,i=[]]=e:[n,o,i=[]]=e;if(!this.ctx.worker&&o&&typeof o==="object"){i=o.transfer??[];o=o.targetOrigin??"/";}'],
  ['e?([c,u=[]]=i,l=null):[c,l,u=[]]=i;', 'e?([c,u=[]]=i,l=null):[c,l,u=[]]=i;if(!e&&l&&typeof l==="object"){u=l.transfer??[];l=l.targetOrigin??"/";}'],
]) {
  if (client.split(before).length !== 2) throw new Error("Review the experience postMessage compatibility patch.");
  client = client.replace(before, after);
}
writeFileSync(clientPath, client);

// Consent SDKs locate their own script with script[src*="otSDKStub"]. The
// rewritten src is encoded; the engine retains the original in __uv-attr-src.
const handlerPath = join(dist, "experience", "handler.js");
let handler = readFileSync(handlerPath, "utf8");
const originalOpen = 'let[s]=l;return s=e.rewriteUrl(s),t.call(r,s)';
const popupOpen = 'let[s]=l;return s=self.__experiencePopupUrl(e.rewriteUrl(s),l[1]),t.apply(r,[s,...l.slice(1)])';
if (handler.split(originalOpen).length !== 2) {
  throw new Error("Review the experience popup transport initialization patch.");
}
handler = handler.replace(originalOpen, popupOpen);
writeFileSync(handlerPath, handler + "\n" + readFileSync(join(root, "site", "popup.js"), "utf8") + String.raw`
;(() => {
  if (typeof document === "undefined") return;
  for (const proto of [Document.prototype, Element.prototype]) {
    const query = proto.querySelector;
    proto.querySelector = function(selector) {
      const result = query.call(this, selector);
      if (result || typeof selector !== "string" || !/^script\[src(?:[*^$|~]?=)/i.test(selector)) return result;
      return query.call(this, selector.replace(/^script\[src/i, "script[__uv-attr-src"));
    };
  }
})();
`);

const noMaps = { recursive: true, filter: (src) => !/\.(map|d\.ts)$/.test(src) };
cpSync(join(modules, "@mercuryworkshop", "bare-mux", "dist"), join(dist, "bridge"), noMaps);
cpSync(join(modules, "@mercuryworkshop", "bare-as-module3", "dist"), join(dist, "transport"), noMaps);

// Preserve upstream copyright and license text alongside redistributed bundles.
const licenseDir = join(dist, "licenses");
mkdirSync(licenseDir, { recursive: true });
for (const [packageName, label] of [
  ["@titaniumnetwork-dev/ultraviolet", "ultraviolet"],
  ["@mercuryworkshop/bare-mux", "bare-mux"],
  ["@mercuryworkshop/bare-as-module3", "bare-as-module3"],
  ["meriyah", "meriyah"],
]) {
  const packageDir = join(modules, packageName);
  const licenses = readdirSync(packageDir).filter((name) => /^licen[sc]e(?:\.|$)/i.test(name));
  if (!licenses.length) throw new Error(`Missing upstream license: ${packageName}`);
  for (const name of licenses) {
    copyFileSync(join(packageDir, name), join(licenseDir, `${label}-${name}`));
  }
}

console.log(`built ${dist}`);
