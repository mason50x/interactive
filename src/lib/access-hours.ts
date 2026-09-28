/**
 * The working-hours gate: production answers Monday–Friday, 7:30 a.m. to
 * 2:55 p.m. Central, and refuses everything the proxy sees outside that.
 *
 * It runs in `src/proxy.ts`, so it covers every route the proxy matches —
 * every page, RSC payload, Server Action and route handler. Static files
 * (`/_next/static`, `public/`) are served by the CDN before the proxy and
 * stay reachable; they are public by construction and carry no session.
 */

/** One shared clock for every visitor, including daylight saving changes. */
const centralClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function isAccessOpen(now: Date = new Date()): boolean {
  const parts = centralClock.formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const minutes = hour * 60 + minute;
  return (
    ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday ?? "") &&
    minutes >= 7 * 60 + 30 &&
    minutes < 14 * 60 + 55
  );
}

/** Client IPs that skip the working-hours gate. */
const BYPASS_IPS = new Set(["66.41.5.109"]);

/**
 * Vercel sets `x-real-ip` to the connecting address and overwrites any value
 * a visitor sends, so it cannot be spoofed. `x-forwarded-for` can carry
 * client-supplied hops and is deliberately not read.
 */
function isBypassed(request: Request): boolean {
  return BYPASS_IPS.has(request.headers.get("x-real-ip") ?? "");
}

/**
 * Only Vercel production is gated. Local `next dev` and `next start`, CI and
 * preview deployments stay up around the clock.
 */
export function isAccessClosed(
  request: Request,
  now: Date = new Date(),
): boolean {
  return (
    process.env.VERCEL_ENV === "production" &&
    !isBypassed(request) &&
    !isAccessOpen(now)
  );
}

export function accessClosedResponse(request: Request): Response {
  return new Response(
    request.method === "HEAD"
      ? null
      : '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Outside working hours</title><body><main><h1>Outside working hours</h1><p>Access is available Monday–Friday, 7:30 a.m.–2:55 p.m. Central time.</p><p>Please return during working hours.</p></main></body></html>',
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
