import { expect, test } from "@playwright/test";

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
