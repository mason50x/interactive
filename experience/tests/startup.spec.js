import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// Use real browser registrations: mocking register() does not exercise the
// lifecycle rule that pending events can hold an update in the waiting state.
test("a pending update does not block launch, and activates when old work finishes", async ({ page }) => {
  let version = 1;
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    response.setHeader("Cache-Control", "no-store");
    if (path === "/sw.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end(`
        const version = ${version};
        let release;
        self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
        self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
        self.addEventListener("message", event => {
          if (event.data === "hold") {
            event.waitUntil(new Promise(resolve => { release = resolve; }));
            event.ports[0].postMessage("held");
          } else if (event.data === "release") release?.();
        });
        self.addEventListener("fetch", event => event.respondWith(new Response(
          "<!doctype html><title>Destination</title><h1>Worker " + version + " opened the destination</h1>",
          { headers: { "Content-Type": "text/html" } }
        )));
      `);
      return;
    }
    try {
      const file = new URL("../site/dist/" + (path === "/" ? "index.html" : path.slice(1)), import.meta.url);
      const body = await readFile(fileURLToPath(file));
      response.setHeader("Content-Type", path === "/" ? "text/html" : "text/javascript");
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await page.goto(origin);
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/service/" });
      const worker = registration.installing || registration.active;
      if (worker.state !== "activated") await new Promise(resolve => {
        worker.addEventListener("statechange", () => { if (worker.state === "activated") resolve(); });
      });
      await new Promise(resolve => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => { channel.port1.close(); resolve(); };
        registration.active.postMessage("hold", [channel.port2]);
      });
    });
    version = 2;
    await page.goto(origin + "/?u=https%3A%2F%2Fexample.com%2F");
    await expect(page.frameLocator("iframe").getByRole("heading", {
      name: "Worker 1 opened the destination",
    })).toBeVisible();
    await expect.poll(() => page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration("/service/");
      return registration.waiting?.state;
    })).toBe("installed");
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration("/service/");
      const update = registration.waiting;
      const activated = new Promise(resolve => update.addEventListener("statechange", () => {
        if (update.state === "activated") resolve();
      }));
      registration.active.postMessage("release");
      await activated;
    });
    await page.reload();
    await expect(page.frameLocator("iframe").getByRole("heading", {
      name: "Worker 2 opened the destination",
    })).toBeVisible();
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
