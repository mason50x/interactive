import { expect, test } from "@playwright/test";

test("embedded launches wait for the current grant and reject messages from other sources", async ({ page }) => {
  await page.route("**/bridge/index.js", route => route.fulfill({
    contentType: "text/javascript",
    body: `self.BareMux = { BareMuxConnection: class {
      async setTransport(module, args) { (self.transportCalls ||= []).push(args); }
    } };`,
  }));
  await page.route("**/access-parent", route => route.fulfill({
    contentType: "text/html",
    body: `<script>
      window.addEventListener('message', event => {
        if (event.data?.type === 'experience-access-request') window.accessRequested = true;
      });
    </script><iframe id="launcher" src="/?u=https%3A%2F%2Fx.com%2F#access=1&appOrigin=${encodeURIComponent("http://localhost:8788")}"></iframe>`,
  }));
  await page.goto("/access-parent");
  await expect.poll(() => page.evaluate(() => window.accessRequested)).toBe(true);
  const launcher = page.frames().find(frame => frame.url().includes("?u="));
  await launcher.evaluate(() => {
    window.postMessage({ type: "experience-access", token: "forged-self-message" }, location.origin);
    window.dispatchEvent(new MessageEvent("message", {
      source: window.parent,
      origin: "https://wrong-origin.test",
      data: { type: "experience-access", token: "forged-origin" },
    }));
  });
  expect(await launcher.evaluate(() => self.transportCalls ?? [])).toEqual([]);
  await page.evaluate(() => {
    document.querySelector("iframe").contentWindow.postMessage({ type: "experience-access", token: "fresh-grant-after-late-launch" }, location.origin);
  });
  await expect.poll(() => launcher.evaluate(() => self.transportCalls?.[0]?.[1])).toBe("fresh-grant-after-late-launch");
  await page.evaluate(() => {
    document.querySelector("iframe").contentWindow.postMessage({ type: "experience-access", token: "renewed-grant" }, location.origin);
  });
  await expect.poll(() => launcher.evaluate(() => self.transportCalls?.at(-1)?.[1])).toBe("renewed-grant");
});

test("the real Bare transport sends the scoped grant on HTTP and WebSocket handshakes", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    // The real relay receives this first WebSocket message before any upstream
    // connection, and denies the intentionally invalid test grant.
    let connected;
    const nativeSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function (value) {
      const message = JSON.parse(value);
      if (message.type === "connect") connected = message.headers["x-experience-access"];
      nativeSend.call(this, value);
    };
    try {
      const { default: Transport } = await import("/transport.mjs");
      const transport = new Transport(location.origin + "/", "scoped-grant");
      const headers = transport.createBareHeaders(new URL("https://x.com/"), {});
      const closed = new Promise(resolve => {
        transport.connect(new URL("wss://x.com/socket"), [], {}, () => {}, () => {}, resolve, resolve);
      });
      await closed;
      return { http: headers.get("x-experience-access"), websocket: connected };
    } finally {
      WebSocket.prototype.send = nativeSend;
    }
  });
  expect(result).toEqual({ http: "scoped-grant", websocket: "scoped-grant" });
});

test("X popups preserve the current scoped grant without exposing it in query parameters", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    self.__uv = new Ultraviolet(experienceConfig);
    __uv.meta.origin = location.origin;
    __uv.meta.base = __uv.meta.url = new URL("https://x.com/");
    self.__experienceAccessToken = "current-scoped-grant";
  });
  await page.addScriptTag({ url: "/popup.js" });
  const result = await page.evaluate(() => {
    const popup = new URL(__experiencePopupUrl(__uv.rewriteUrl("https://x.com/i/flow/login"), "_blank"));
    return { query: popup.search, grant: new URLSearchParams(popup.hash.slice(1)).get("grant") };
  });
  expect(result.grant).toBe("current-scoped-grant");
  expect(result.query).not.toContain("grant");
  expect(result.query).toContain("u=https%3A%2F%2Fx.com");
});
