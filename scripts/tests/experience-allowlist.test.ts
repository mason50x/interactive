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
    "xbox",
    "youtube",
    "netflix",
    "tiktok",
    "spotify",
    "gemini",
    "apple-music",
    "soccerrng",
  ]) {
    const app = findExperienceApp(id);
    expect(app).not.toBeNull();
    const response = await relay(app!.start);
    expect(response.headers.get("x-bare-status")).toBe("200");
  }
  expect(new Set(EXPERIENCE_APPS.map((app) => app.id)).size).toBe(
    EXPERIENCE_APPS.length,
  );
  expect(upstream).toHaveBeenCalledTimes(8);
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
  "https://assets.footylogos.com/logos/real-madrid/real-madrid-logo-footylogos.svg",
  "https://publish.realmadrid.com/content/dam/portals/realmadrid-com/es-es/sports/football/example.png",
  "https://assets.realmadrid.com/is/image/realmadrid/MBAPPE_POSE_1500X2000?%24Desktop%24=&fit=wrap&wid=420",
  "https://www.fcbarcelona.com/photo-resources/2026/08/01/example/example.png",
  "https://media.psg.fr/image/upload/w_1000/f_auto,q_auto/Dembele-Motion-2627_muowar",
  "https://img.fcbayern.com/image/upload/example.png",
  "https://dynamic-crop-cdn.scoreplay.io/472/4896325/media_102559861_102166984.jpg?f=center&fmt=webp&h=981&w=720",
  "https://contentfulproxy.stadion.io/9ec6988xevcz/1WEMKAOOx0uqpP0TB6oavt/example.png",
  "https://contentfulproxy.stadion.io/unzgbvss5tuy/3daUM6Old26XdT82zzizw1/example/Shea_Lacey.jpg",
  "https://www.juventus.com/images/image/private/t_portrait_mobile/example",
  "https://intermilan.bynder.com/transform/1122af81-078b-4318-9a47-952fe8a66148/Pio_Esposito_2x?format=webp",
  "https://www.acmilan.com/_next/image?q=75&url=https%3A%2F%2Fassets-eu-01.kc-usercontent.com%2Fexample.png",
  "https://media.asroma.com/prod/images/example.png",
  "https://s7g10.scene7.com/is/image/BORUSSIADORTMUNDGMBHANDCOKGAA/example",
  "https://images.mlssoccer.com/image/private/t_thumb_squared/f_png/mls-mia/g9tieb27bu41atzhhskt.png",
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
  "https://www.realmadrid.com/en-US/football/first-team/players/kylian-mbappe",
  "https://www.fcbarcelona.com/en/football/first-team/players/",
  "https://www.acmilan.com/en/team/players/",
  "https://s7g10.scene7.com/is/image/unrelated/example",
  "https://contentfulproxy.stadion.io/otherspace/example.png",
  "https://evilnetlify.app/",
  "https://other-site.netlify.app/",
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

it.each(xHosts)("blocks X host %s, its subdomains and lookalikes without a grant", async (host) => {
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
])("blocks X navigation, authentication, scripts and media without a grant: %s", async (url) => {
  const upstream = vi.fn();
  vi.stubGlobal("fetch", upstream);
  const response = await relay(url);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: "HOST_NOT_ALLOWED" });
  expect(upstream).not.toHaveBeenCalled();
});

it.each([
  "https://assets.play.xbox.com/playxbox/static/js/client.js",
  "https://login.live.com/oauth20_authorize.srf",
  "https://account.live.com/consent/Manage",
  "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize",
  "https://logincdn.msauth.net/shared/1.0/content/js/login.js",
  "https://logincdn.msftauth.net/shared/1.0/content/js/login.js",
  "https://fpt.live.com/",
  "https://df.cfp.microsoft.com/Clear.HTML",
  "https://user.auth.xboxlive.com/user/authenticate",
  "https://xsts.auth.xboxlive.com/xsts/authorize",
  "https://sisu.xboxlive.com/authorize",
  "https://gamingconsent.xboxlive.com/",
  "https://gssv-play-prod.xboxlive.com/v2/login/user",
  "https://eastus.gssv-play-prod.xboxlive.com/v5/sessions/cloud/play",
  "https://emerald.xboxservices.com/",
  "https://catalog.gamepass.com/sigls/v2",
  "https://displaycatalog.mp.microsoft.com/v7.0/products",
  "https://store-images.s-microsoft.com/image/apps/example",
  "https://wcpstatic.microsoft.com/mscc/lib/v2/wcp-consent.js",
  "https://res.public.onecdn.static.microsoft/creativeservice/game.png",
  "https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js",
])("relays Xbox catalog, authentication, consent, and streaming service dependencies: %s", async url => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("ok")));
  expect((await relay(url)).headers.get("x-bare-status")).toBe("200");
});

it.each([
  "https://xbox.com.evil.example/", "https://evilxboxlive.com/",
  "https://unrelated.azureedge.net/", "https://www.microsoft.com/en-us/",
  "https://cdnjs.cloudflare.com/ajax/libs/unrelated/script.js",
])("Xbox allowances do not open lookalikes or unrelated services: %s", async url => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  expect((await relay(url)).status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});

it("records upstream authentication failures without URLs, cookies, or credentials", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async () => new Response("denied", { status: 403 })));
  const response = await relay("https://accounts.spotify.com/login?token=private-token");
  expect(response.headers.get("x-bare-status")).toBe("403");
  expect(warn).toHaveBeenCalledExactlyOnceWith("experience_upstream_response", {
    host: "accounts.spotify.com", method: "GET", status: 403, durationMs: expect.any(Number),
  });
});

it("network failure diagnostics omit sensitive upstream URLs", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("failed https://login.live.com/?token=private-token"); }));
  expect((await relay("https://login.live.com/?token=private-token")).status).toBe(500);
  expect(error).toHaveBeenCalledExactlyOnceWith("experience_upstream_failed", {
    host: "login.live.com", method: "GET", durationMs: expect.any(Number), timedOut: false, error: "Error",
  });
});
