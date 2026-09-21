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

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("offers each service and allows its front door through the actual relay", async () => {
  const upstream = vi.fn(async () => new Response("ok"));
  vi.stubGlobal("fetch", upstream);
  for (const id of [
    "youtube",
    "netflix",
    "tiktok",
    "spotify",
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
  expect(upstream).toHaveBeenCalledTimes(6);
});

it.each([
  "https://accounts.google.com/v3/signin/identifier?service=youtube",
  "https://accounts.youtube.com/accounts/CheckConnection",
  "https://www.google.com/js/bg/auth.js",
  "https://accounts.spotify.com/en/login",
  "https://open.spotifycdn.com/cdn/build/web-player.js",
  "https://i.scdn.co/image/example",
  "https://challenges.cloudflare.com/turnstile/v0/api.js",
  "https://geminiweb-pa.clients6.google.com/",
  "https://idmsa.apple.com/appleauth/auth/authorize/signin",
  "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js",
  "https://is1-ssl.mzstatic.com/image/example",
])("relays service authentication/assets: %s", async (url) => {
  const upstream = vi.fn(async () => new Response("ok"));
  vi.stubGlobal("fetch", upstream);
  const response = await relay(url);
  expect(response.headers.get("x-bare-status")).toBe("200");
  expect(upstream.mock.calls).toHaveLength(1);
});

it.each([
  "https://chatgpt.com/",
  "https://claude.ai/",
  "https://auth.openai.com/",
  "https://auth0.openai.com/",
  "https://chat.openai.com/",
  "https://oaistatic.com/",
  "https://oaiusercontent.com/",
  "https://cdn.openaimerge.com/",
  "https://cdn.workos.com/",
  "https://images.workoscdn.com/",
  "https://setup.workos.com/",
  "https://forwarder.workos.com/",
  "https://workos.imgix.net/",
  "https://assets-proxy.anthropic.com/",
  "https://hcaptcha.com/",
  "https://hcaptcha.net/",
  "https://example.com/",
  "https://accounts.google.com.evil.example/",
  "https://evilspotify.com/",
  "https://www.google.com/search?q=test",
  "https://www.apple.com/shop/",
  "https://appleid.cdn-apple.com/unrelated/",
  "https://appleid.cdn-apple.com.evil.example/appleauth/",
  "https://127.0.0.1/",
])("rejects unrelated destinations before fetching: %s", async (url) => {
  const upstream = vi.fn();
  vi.stubGlobal("fetch", upstream);
  const response = await relay(url);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: "HOST_NOT_ALLOWED" });
  expect(upstream).not.toHaveBeenCalled();
});

const tiktokHosts = [
  "tiktok.com", "tiktokcdn-eu.com", "tiktokcdn-us.com", "tiktokcdn.com", "tiktokv.us",
  "tiktokv.eu", "tiktokw.eu", "tiktokw.us", "tiktokv.com", "ttwstatic.com", "muscdn.com",
];

it.each(tiktokHosts)("allows TikTok dependency %s and rejects hostname lookalikes", async (host) => {
  const upstream = vi.fn(async () => new Response("ok"));
  vi.stubGlobal("fetch", upstream);
  for (const hostname of [host, `regional.${host}`]) {
    const response = await relay(`https://${hostname}/asset?signature=example`);
    expect(response.headers.get("x-bare-status")).toBe("200");
  }
  upstream.mockClear();
  for (const hostname of [`evil${host}`, `${host}.evil.example`]) {
    expect((await relay(`https://${hostname}/`)).status).toBe(403);
  }
  expect(upstream).not.toHaveBeenCalled();
});

it.each([
  "https://www.tiktok.com/login/phone-or-email/email",
  "https://vm.tiktok.com/shortlink/",
  "https://login-us.www.tiktok.com/passport/web/account/info/",
  "https://lf16-tiktok-web.tiktokcdn-us.com/obj/tiktok-web-tx/app.js",
  "https://sf16-website-login.neutral.tiktokcdn-eu.com/obj/tiktok_web_login_static_eu/tiktok/webapp/main/player-split/webapp-desktop/static/js/async/foryou.islands.46378931.js",
  "https://sf16-website-login.neutral.ttwstatic.com/obj/login/app.js",
  "https://v16m-webapp.tiktokcdn-us.com/video/tos/example/?signature=test",
  "https://verification-ttp2.tiktokw.us/captcha/get",
  "https://libra16-normal-useast8.tiktokv.us/",
  "https://libraweb-ttp2.tiktokw.eu/service/2/abtest_config/",
  "https://webmssdk16-normal-no1a.tiktokw.eu/web/resource",
  "https://mon16-normal-no1a.tiktokv.eu/monitor_web/settings/browser-settings",
])("relays TikTok navigation, login, scripts, video and verification: %s", async (url) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("ok")));
  expect((await relay(url)).headers.get("x-bare-status")).toBe("200");
});


it("logs denied destination hosts without signed paths or credentials", async () => {
  const log = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn());
  await relay("https://user:password@unlisted.example/private-token?signature=secret");
  expect(log).toHaveBeenCalledExactlyOnceWith("experience_destination_denied", { host: "unlisted.example" });
});

const xHosts = ["x.com", "twitter.com", "twimg.com", "t.co"];

it.each(xHosts)("blocks disabled X host %s, its subdomains and lookalikes", async (host) => {
  const upstream = vi.fn(async () => new Response("ok"));
  vi.stubGlobal("fetch", upstream);
  for (const hostname of [host, `cdn.${host}`]) {
    expect((await relay(`https://${hostname}/`)).status).toBe(403);
  }
  for (const hostname of [`evil${host}`, `${host}.evil.example`]) {
    expect((await relay(`https://${hostname}/`)).status).toBe(403);
  }
  expect(upstream).not.toHaveBeenCalled();
});

it.each([
  "https://x.com/i/flow/login",
  "https://x.com/i/jf/onboarding/web?mode=login",
  "https://api.x.com/1.1/onboarding/task.json",
  "https://api.twitter.com/1.1/guest/activate.json",
  "https://abs.twimg.com/x-web/x-web/entry-client-logged-out-CMgGjOLA.js",
  "https://abs.twimg.com/fonts/subset/Chirp-Regular.c88864db.latin.woff2",
  "https://pbs.twimg.com/media/example.jpg",
  "https://video.twimg.com/ext_tw_video/example/vid/avc1/video.mp4",
  "https://ton.twimg.com/responsive-web/example.js",
  "https://cdn.syndication.twimg.com/tweet-result?id=123",
  "https://t.co/example",
])("blocks disabled X navigation, authentication, scripts and media: %s", async (url) => {
  const upstream = vi.fn();
  vi.stubGlobal("fetch", upstream);
  const response = await relay(url);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: "HOST_NOT_ALLOWED" });
  expect(upstream).not.toHaveBeenCalled();
});
