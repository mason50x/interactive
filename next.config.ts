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
