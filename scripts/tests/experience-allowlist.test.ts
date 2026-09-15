import { afterEach, expect, it, vi } from "vitest";
import worker from "../../experience/src/worker.js";
import { EXPERIENCE_APPS, findExperienceApp } from "../../src/lib/experience";

const relay = (url: string) =>
  worker.fetch(
    new Request("https://experience.test/v3/", {
      headers: { "x-bare-url": url, "x-bare-headers": "{}" },
    }),
    {},
  );

afterEach(() => vi.unstubAllGlobals());

it("offers each service and allows its front door through the actual relay", async () => {
  const upstream = vi.fn(async () => new Response("ok"));
  vi.stubGlobal("fetch", upstream);
  for (const id of [
    "youtube",
    "netflix",
    "spotify",
    "chatgpt",
    "claude",
    "gemini",
    "apple-music",
  ]) {
    const app = findExperienceApp(id);
    expect(app).not.toBeNull();
    const response = await relay(app!.start);
    expect(response.headers.get("x-bare-status")).toBe("200");
  }
  expect(new Set(EXPERIENCE_APPS.map((app) => app.id)).size).toBe(
    EXPERIENCE_APPS.length,
  );
  expect(upstream).toHaveBeenCalledTimes(7);
});

it.each([
  "https://accounts.google.com/v3/signin/identifier?service=youtube",
  "https://accounts.youtube.com/accounts/CheckConnection",
  "https://www.google.com/js/bg/auth.js",
  "https://accounts.spotify.com/en/login",
  "https://open.spotifycdn.com/cdn/build/web-player.js",
  "https://i.scdn.co/image/example",
  "https://auth.openai.com/authorize",
  "https://cdn.oaistatic.com/assets/app.js",
  "https://challenges.cloudflare.com/turnstile/v0/api.js",
  "https://geminiweb-pa.clients6.google.com/",
  "https://idmsa.apple.com/appleauth/auth/authorize/signin",
  "https://is1-ssl.mzstatic.com/image/example",
])("relays service authentication/assets: %s", async (url) => {
  const upstream = vi.fn(async () => new Response("ok"));
  vi.stubGlobal("fetch", upstream);
  const response = await relay(url);
  expect(response.headers.get("x-bare-status")).toBe("200");
  expect(upstream.mock.calls).toHaveLength(1);
});

it.each([
  "https://example.com/",
  "https://accounts.google.com.evil.example/",
  "https://evilspotify.com/",
  "https://www.google.com/search?q=test",
  "https://www.apple.com/shop/",
  "https://127.0.0.1/",
])("rejects unrelated destinations before fetching: %s", async (url) => {
  const upstream = vi.fn();
  vi.stubGlobal("fetch", upstream);
  const response = await relay(url);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: "HOST_NOT_ALLOWED" });
  expect(upstream).not.toHaveBeenCalled();
});
