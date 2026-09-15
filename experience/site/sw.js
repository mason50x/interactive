/*global UVServiceWorker,experienceConfig*/
// The engine's service worker, registered by index.html over /service/.
// Paths are absolute because this file sits at the root and the engine under
// /experience/ — see scripts/build-site.mjs for where each lands.
//
// Two calls, not one: the arguments to a single call are evaluated before any
// of its scripts run, so the config global would not exist yet.
importScripts("/experience/bundle.js", "/experience/config.js");
importScripts(experienceConfig.sw);

const engine = new UVServiceWorker();

self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  event.respondWith(loadExperience(event));
});

async function loadExperience(event) {
  if (!engine.route(event)) return fetch(event.request);
  const response = await engine.fetch(event);
  // Keep the library's diagnostics out of the page shown to learners.
  if (response.status >= 500 && ["document", "iframe"].includes(event.request.destination)) {
    const notice = await fetch("/unavailable.html");
    return new Response(notice.body, {
      status: 502,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return response;
}
