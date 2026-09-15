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
  // Direct top-level navigation (target=_blank links, pasted links, restored
  // tabs) must initialize its own BareMux transport. Iframe navigations already
  // have the launcher as a live client and must not redirect back into it.
  if (event.request.mode === "navigate" && event.request.destination === "document") {
    const encoded = event.request.url.slice(location.origin.length + experienceConfig.prefix.length);
    const launcher = new URL("/", location.origin);
    launcher.searchParams.set("u", experienceConfig.decodeUrl(encoded));
    return Response.redirect(launcher.href, 302);
  }
  const response = await engine.fetch(event);
  // Claude sometimes serves a Cloudflare challenge instead of its app. That
  // challenge cannot finish through this relay and otherwise renders blank.
  if (
    ["document", "iframe"].includes(event.request.destination) &&
    response.headers.get("cf-mitigated") === "challenge" &&
    new URL(experienceConfig.decodeUrl(event.request.url.slice(
      location.origin.length + experienceConfig.prefix.length,
    ))).hostname === "claude.ai"
  ) {
    const notice = await fetch("/claude-unavailable.html");
    return new Response(notice.body, {
      status: response.status,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }
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
