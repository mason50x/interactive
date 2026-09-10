/*global UVServiceWorker,__uv$config*/
// The engine's service worker, registered by index.html over /service/.
// Paths are absolute because this file sits at the root and the engine under
// /engine/ — see scripts/build-site.mjs for where each lands.
//
// Two calls, not one: the arguments to a single call are evaluated before any
// of its scripts run, so the config global would not exist yet.
importScripts("/engine/bundle.js", "/engine/config.js");
importScripts(__uv$config.sw);

const engine = new UVServiceWorker();

self.addEventListener("fetch", (event) => {
  event.respondWith(engine.route(event) ? engine.fetch(event) : fetch(event.request));
});
