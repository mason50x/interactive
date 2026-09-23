import handler from "vinext/server/fetch-handler";

/** One shared clock for every visitor, including daylight saving changes. */
const centralClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function isAccessOpen(now: Date = new Date()): boolean {
  const parts = centralClock.formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const minutes = hour * 60 + minute;
  return (
    ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday ?? "") &&
    minutes >= 7 * 60 + 35 &&
    minutes < 14 * 60 + 55
  );
}

/** Client IPs that skip the working-hours gate. */
const BYPASS_IPS = new Set(["66.41.5.109"]);

/** Cloudflare sets this header; it cannot be spoofed by visitors. */
function isBypassed(request: Request): boolean {
  return BYPASS_IPS.has(request.headers.get("CF-Connecting-IP") ?? "");
}

/**
 * Development servers (wrangler dev, vinext dev) serve on loopback. The
 * production bundle inlines NODE_ENV as "production" even under those
 * servers, so the build-time flag alone cannot tell them apart from real
 * production traffic. Public production traffic never arrives on loopback.
 */
function isLoopback(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
  );
}

function accessClosedResponse(request: Request): Response {
  return new Response(
    request.method === "HEAD"
      ? null
      : '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Outside working hours</title><body><main><h1>Outside working hours</h1><p>Access is available Monday–Friday, 7:35 a.m.–2:55 p.m. Central time.</p><p>Please return during working hours.</p></main></body></html>',
    {
      status: 403,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      },
    },
  );
}

/** Apply policy to redirects and errors as well as rendered HTML. */
export default {
  async fetch(request: Request, env, ctx) {
    // Production-only gate: development servers stay up around the clock.
    // Blocks Friday 2:55 p.m. through Monday 7:35 a.m. Central, plus every
    // night outside 7:35 a.m.–2:55 p.m. on weekdays. Loopback requests are
    // always development servers (wrangler dev / vinext dev), which also
    // serve the production bundle with NODE_ENV inlined as "production".
    if (
      process.env.NODE_ENV === "production" &&
      !isLoopback(request) &&
      !isBypassed(request) &&
      !isAccessOpen()
    ) {
      return accessClosedResponse(request);
    }
    // run_worker_first applies response policy to static files as well.
    // Vinext expects the asset layer to have served matching files already.
    let assetResponse: Response | undefined;
    if (request.method === "GET" || request.method === "HEAD") {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) assetResponse = asset;
      else await asset.body?.cancel();
    }
    const response: Response =
      assetResponse ?? (await handler.fetch(request, env, ctx));
    const headers = new Headers(response.headers);
    const path = new URL(request.url).pathname;
    const learn = path === "/learn" || path.startsWith("/learn/");
    headers.set(
      "X-Robots-Tag",
      "noindex, nofollow, noarchive, nosnippet, noimageindex, notranslate, noai, noimageai",
    );
    headers.set(
      "Content-Security-Policy",
      learn ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
    );
    // Cloudflare assets default to max-age=0: every revisit otherwise asks
    // this Worker to revalidate unchanged files. Cache only actual successful
    // assets privately for a fixed lifetime.
    if (assetResponse && (response.status === 200 || response.status === 304)) {
      const maxAge = path.startsWith("/_next/static/") ? 3600 : 300;
      headers.set(
        "Cache-Control",
        `private, max-age=${maxAge}, must-revalidate`,
      );
      // The asset's upstream Age/Date must not shorten or extend this policy.
      headers.delete("Age");
      headers.delete("Expires");
      headers.set("Date", new Date().toUTCString());
    }
    if (
      learn ||
      [
        "/home",
        "/admin",
        "/leaderboard",
        "/activities",
        "/chat",
        "/experience",
        "/learning-simulator",
        "/dashboard",
      ].some((root) => path === root || path.startsWith(`${root}/`)) ||
      path === "/auth" ||
      path.startsWith("/auth/")
    ) {
      headers.set("Cache-Control", "private, no-store");
    }
    if (learn) {
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "no-referrer");
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
} satisfies ExportedHandler<Cloudflare.Env>;
