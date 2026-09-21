import { expect, test } from "@playwright/test";

test("the launcher supplies a transport before waiting on a worker update", async ({ page }) => {
  await page.route("**/bridge/index.js", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + `
      const originalSetTransport = BareMux.BareMuxConnection.prototype.setTransport;
      BareMux.BareMuxConnection.prototype.setTransport = async function (...args) {
        await originalSetTransport.apply(this, args);
        self.transportReady = true;
      };
    ` });
  });
  await page.addInitScript(() => {
    const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register = (...args) => {
      // A previous worker can have unfinished fetches needing this page's port.
      // Its update cannot finish until a transport is available.
      if (!self.transportReady) return new Promise(() => {});
      return register(...args);
    };
  });
  await page.goto("/?u=https%3A%2F%2Fexample.com%2F");
  await expect(page.frameLocator("iframe").getByText("This page couldn’t load")).toBeVisible();
});

test("dynamic imports resolve against the importing module, not the page or themselves", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const engine = new Ultraviolet(experienceConfig);
    engine.meta.origin = location.origin;
    engine.meta.base = engine.meta.url = new URL("https://music.apple.com/assets/player.js");
    const rewritten = engine.rewriteJS('return import("./controls.js")');
    let args;
    await new Function("__uv", rewritten)({ rewriteImport: (...values) => {
      args = values;
      return 'data:text/javascript,export const loaded = true';
    } });
    // The page base differs from the source module once its code executes.
    engine.meta.base = engine.meta.url = new URL("https://music.apple.com/us/new");
    return engine.sourceUrl(engine.rewriteImport(...args));
  });
  expect(result).toBe("https://music.apple.com/assets/controls.js");
});

test("module imports are rewritten when a for-of loop awaits a function named of", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const engine = new Ultraviolet(experienceConfig);
    engine.meta.origin = location.origin;
    engine.meta.base = engine.meta.url = new URL("https://music.apple.com/assets/app.js");
    const source = 'import { of } from "./vendor.js"; async function run() { for (const item of await of()) { console.log(item); } }';
    const rewritten = engine.rewriteJS(source);
    const executable = engine.rewriteJS('return (async () => { const of = async () => [42]; for (const item of await of()) return item; })()');
    return {
      imported: rewritten.includes(engine.rewriteUrl("./vendor.js")),
      value: await new Function(executable)(),
    };
  });
  expect(result).toEqual({ imported: true, value: 42 });
});

test("CSS URL rewriting preserves nested empty fallbacks and subsequent rules", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(() => {
    const engine = new Ultraviolet(experienceConfig);
    engine.meta.origin = location.origin;
    engine.meta.base = engine.meta.url = new URL("https://www.youtube.com/styles/main.css");
    const original = `
      @media (min-width: 1px) {
        .background { background-image: var(--image, url()), var(--behind); }
        .next { display: flex; }
      }
      .header { height: 56px; background-image: url(../header.png); }
      .quoted { background-image: url("https://i.ytimg.com/image.png"); }
      .empty { background-image: url(""); }
      .last { color: red; }
    `;
    const rewritten = engine.rewriteCSS(original);
    const before = new CSSStyleSheet();
    const after = new CSSStyleSheet();
    before.replaceSync(original);
    after.replaceSync(rewritten);
    return {
      before: before.cssRules.length,
      after: after.cssRules.length,
      nested: after.cssRules[0].cssRules.length,
      fallback: rewritten.includes("var(--image, url()), var(--behind)"),
      image: rewritten.includes(engine.rewriteUrl("https://www.youtube.com/header.png")),
      last: after.cssRules[after.cssRules.length - 1].selectorText,
      roundtrip: engine.sourceCSS(rewritten),
      original,
    };
  });
  expect(result.after).toBe(result.before);
  expect(result.nested).toBe(2);
  expect(result.fallback).toBe(true);
  expect(result.image).toBe(true);
  expect(result.last).toBe(".last");
  expect(result.roundtrip).toContain("var(--image, url()), var(--behind)");
});

test("loopback transport sends API request bytes without streaming uploads", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    let captured;
    const nativeFetch = window.fetch;
    // The upstream transport captures fetch at import time, as in the bridge.
    window.fetch = async (_url, options) => {
      captured = { streaming: options.body instanceof ReadableStream, text: await new Response(options.body).text() };
      return new Response("{}", { headers: {
        "x-bare-status": "200", "x-bare-status-text": "OK",
        "x-bare-headers": '{"content-type":"application/json"}',
      } });
    };
    try {
      const { default: Transport } = await import("/transport.mjs");
      const transport = new Transport(location.origin + "/");
      await transport.request(new URL("https://www.youtube.com/youtubei/v1/search"), "POST", new Response('{"query":"science"}').body, {}, undefined);
      return captured;
    } finally {
      window.fetch = nativeFetch;
    }
  });
  expect(result).toEqual({ streaming: false, text: '{"query":"science"}' });
});

test("failed destinations show a branded retry screen without engine diagnostics", async ({ page }) => {
  await page.goto("/?u=https%3A%2F%2Fexample.com%2F");
  const frame = page.frameLocator("iframe");
  await expect(frame.getByRole("heading", { name: "This page couldn’t load" })).toBeVisible();
  await expect(frame.locator("body")).not.toContainText(/proxy|unblocked|ultraviolet|\buv\b/i);
  await frame.getByRole("button", { name: "Try again" }).click();
  await expect(frame.getByRole("heading", { name: "This page couldn’t load" })).toBeVisible();
});

test("postMessage options preserve transferable ports", async ({ page }) => {
  await page.goto("/");
  await page.addScriptTag({ url: "/experience/client.js" });
  const result = await page.evaluate(async () => {
    const client = new UVClient(window);
    client.message.overridePostMessage();
    const send = client.message.wrapPostMessage(window, "postMessage");
    const received = new Promise(resolve => {
      window.addEventListener("message", event => {
        if (event.data !== "port-test") return;
        event.ports[0].postMessage("received");
      }, { once: true });
      const channel = new MessageChannel();
      channel.port1.onmessage = event => resolve(event.data);
      send("port-test", { targetOrigin: location.origin, transfer: [channel.port2] });
    });
    return received;
  });
  expect(result).toBe("received");
});

test("popup URLs initialize a new transport without changing in-place navigation", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    self.__uv = new Ultraviolet(experienceConfig);
    __uv.meta.origin = location.origin;
    __uv.meta.base = __uv.meta.url = new URL("https://gemini.google.com/app");
  });
  await page.addScriptTag({ url: "/popup.js" });
  const result = await page.evaluate(() => {
    const destination = "https://gemini.google.com/signin?continue=https%3A%2F%2Fgemini.google.com%2Fapp";
    const rewritten = __uv.rewriteUrl(destination);
    return {
      destination,
      popup: new URL(__experiencePopupUrl(rewritten, "_blank")).searchParams.get("u"),
      named: new URL(__experiencePopupUrl(rewritten, "google-signin")).pathname,
      inPlace: __experiencePopupUrl(rewritten, "_self") === rewritten,
      blank: __experiencePopupUrl("about:blank", "_blank"),
    };
  });
  expect(result.popup).toBe(result.destination);
  expect(result.named).toBe("/");
  expect(result.inPlace).toBe(true);
  expect(result.blank).toBe("about:blank");
});

test("a restored top-level service URL bootstraps with no other live page", async ({ page, context }) => {
  const destination = "https://example.com/?continue=https%3A%2F%2Fexample.com%2Fapp";
  await page.goto("/?u=" + encodeURIComponent(destination));
  await expect(page.frameLocator("iframe").getByRole("heading", { name: "This page couldn’t load" })).toBeVisible();
  const direct = await page.evaluate(url => location.origin + experienceConfig.prefix + experienceConfig.encodeUrl(url), destination);
  await page.close();
  const restored = await context.newPage();
  await restored.goto(direct);
  await expect(restored).toHaveURL(url => url.pathname === "/" && url.searchParams.get("u") === destination);
  await expect(restored.frameLocator("iframe").getByRole("heading", { name: "This page couldn’t load" })).toBeVisible();
  await expect(restored.locator("body")).not.toContainText("MessagePort");
});

test("the installed window.open hook preserves target and popup features", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.addScriptTag({ url: "/experience/client.js" });
  await page.evaluate(async () => {
    const connection = new BareMux.BareMuxConnection("/bridge/worker.js");
    await connection.setTransport("/transport.mjs", [location.origin + "/"]);
    history.replaceState(null, "", experienceConfig.prefix + experienceConfig.encodeUrl("https://gemini.google.com/app"));
    self.__uv$cookies = "";
    self.__uv$referrer = "";
    self.openCalls = [];
    self.open = (...args) => { openCalls.push(args); return null; };
  });
  await page.addScriptTag({ url: "/experience/handler.js" });
  const calls = await page.evaluate(() => {
    window.open("https://gemini.google.com/signin?continue=%2Fapp", "google-login", "noopener,width=480");
    window.open("/app", "_self");
    return openCalls;
  });
  expect(errors).toEqual([]);
  const popup = new URL(calls[0][0]);
  expect(popup.pathname).toBe("/");
  expect(popup.searchParams.get("u")).toBe("https://gemini.google.com/signin?continue=%2Fapp");
  expect(calls[0].slice(1)).toEqual(["google-login", "noopener,width=480"]);
  expect(new URL(calls[1][0]).pathname).toMatch(/^\/service\//);
  expect(calls[1][1]).toBe("_self");
});

test("a login response injects its rotated cookie into the next document", async ({ page }) => {
  await page.goto("/");
  await page.addScriptTag({ url: "/experience/sw.js" });
  const result = await page.evaluate(async () => {
    self.clients = { matchAll: async () => [] };
    const uv = new Ultraviolet(experienceConfig);
    uv.meta.origin = location.origin;
    uv.meta.base = uv.meta.url = new URL("https://x.com/home");
    const db = await uv.cookie.db();
    uv.cookie.setCookies("ct0=before-login; Domain=x.com; Path=/; Secure", db, uv.meta);
    await uv.cookie.getCookies(db);
    const engine = new UVServiceWorker();
    engine.bareClient = { fetch: async () => {
      const response = new Response("<!doctype html><html><head></head><body>Home</body></html>", {
        headers: { "content-type": "text/html" },
      });
      response.finalURL = "https://x.com/home";
      response.rawHeaders = { "content-type": "text/html", "set-cookie": [
        "ct0=after-login; Domain=x.com; Path=/; Secure",
        "auth_token=private-fixture; Domain=x.com; Path=/; Secure; HttpOnly",
      ] };
      return response;
    } };
    const request = new Request(uv.rewriteUrl("https://x.com/home"));
    Object.defineProperty(request, "destination", { value: "iframe" });
    const response = await engine.fetch({ request });
    return { status: response.status, html: await response.text() };
  });
  expect(result.status, result.html).toBe(200);
  expect(result.html).toContain("ct0=after-login");
  expect(result.html).not.toContain("ct0=before-login");
  expect(result.html).not.toContain("private-fixture");
});

test("document.cookie follows response updates without exposing HttpOnly cookies", async ({ page }) => {
  await page.goto("/");
  await page.addScriptTag({ url: "/experience/client.js" });
  await page.evaluate(async () => {
    const connection = new BareMux.BareMuxConnection("/bridge/worker.js");
    await connection.setTransport("/transport.mjs", [location.origin + "/"]);
    history.replaceState(null, "", experienceConfig.prefix + experienceConfig.encodeUrl("https://x.com/home"));
    self.__uv$cookies = "ct0=old";
    self.__uv$referrer = "";
    self.cookieUpdates = navigator.serviceWorker;
  });
  await page.addScriptTag({ url: "/experience/handler.js" });
  expect(await page.evaluate(() => document.cookie)).toBe("ct0=old");
  await page.evaluate(async () => {
    const db = await __uv.cookie.db();
    __uv.cookie.setCookies([
      "ct0=fresh; Domain=x.com; Path=/; Secure",
      "auth_token=hidden; Domain=x.com; Path=/; HttpOnly; Secure",
      "other=unrelated; Domain=twitter.com; Path=/",
    ], db, __uv.meta);
    await __uv.cookie.getCookies(db);
    cookieUpdates.dispatchEvent(new MessageEvent("message", { data: { msg: "updateCookies", url: "https://x.com/i/api/example" } }));
  });
  await expect.poll(() => page.evaluate(() => document.cookie)).toBe("ct0=fresh");
});
