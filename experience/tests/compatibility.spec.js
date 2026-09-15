import { expect, test } from "@playwright/test";

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
    engine.meta.base = engine.meta.url = new URL("https://claude.ai/assets/app.js");
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
