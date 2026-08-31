import type { NextConfig } from "next";

/**
 * Framing policy for one origin.
 *
 * A activity is framed twice over: a dashboard page frames `/learn/<slug>`, and
 * that page in turn frames the bundle on the asset origin. The first of those
 * is same-origin now that the player host is gone (see `src/lib/learn.ts`), so
 * `/learn` has to permit being framed by this same origin — `frame-ancestors
 * 'none'`, which the rest of the app uses to refuse embedding outright, would
 * block our own dashboard from framing it.
 *
 * The bundle itself sends no `frame-ancestors`; it is a static file on the
 * asset origin and is contained by the iframe `sandbox` (see `ActivityFrame`
 * and `HostedActivity`), not by a header it does not emit.
 */
const nextConfig: NextConfig = {
  experimental: {
    /**
     * How long the router may reuse what it has already fetched.
     *
     * The pair matters more than either number. Every route under `/dashboard`
     * reads cookies through `auth.protect()` and is therefore dynamic, and a
     * dynamic route's client cache is off by default — `dynamic: 0` means the
     * router throws away the payload the moment it has rendered it, so leaving
     * a page and coming back is a second full server render of the same thing.
     * Thirty seconds is enough to cover the round trip of opening an activity
     * and closing it again, and short enough that a streak or an unread count
     * cannot be caught out by it. Nothing on these pages is server-rendered
     * anyway: the numbers are Convex subscriptions and refresh themselves.
     *
     * `static` is the one `src/lib/warm.ts` fills. A `router.prefetch` lands
     * under this bucket rather than the dynamic one, which is what makes the
     * rail's warming last past the next click; at the default `dynamic: 0` a
     * warmed route would go cold on arrival and the whole thing would be a
     * server render for nothing. Five minutes is the default, written out
     * because the warming reads as deliberate only next to a number.
     */
    staleTimes: { dynamic: 30, static: 300 },
  },

  async headers() {
    return [
      {
        // The one route framed by this app. `sandbox` on the iframe governs
        // what the framed activity may do; this governs who may embed it, and
        // the answer is this origin and nobody else.
        source: "/learn/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // A activity URL is the only referrer a third-party asset could leak,
          // and it identifies nothing useful. Send nothing.
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        // Everything else is never framed by anything.
        source: "/((?!learn).*)",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
