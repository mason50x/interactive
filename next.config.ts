import type { NextConfig } from "next";

/**
 * The player's *hostname*, read the same way `src/lib/player.ts` reads it, and
 * duplicated rather than imported because `next.config.ts` is evaluated before
 * the `@/` path alias exists.
 *
 * Hostname, not host: a `has: [{ type: "host" }]` matcher compares the name
 * with the port stripped, so a value of `127.0.0.1:3000` silently matches
 * nothing. That failure is invisible in the config and shows up only as the
 * player origin inheriting the app's `frame-ancestors 'none'` and refusing to
 * be framed at all. `src/proxy.ts` matches the raw `Host` header instead, and
 * so does keep the port.
 */
const playerHostname = (() => {
  const configured = process.env.NEXT_PUBLIC_PLAYER_ORIGIN;
  if (!configured) return null;
  try {
    return new URL(configured.replace(/\/$/, "")).hostname;
  } catch {
    return null;
  }
})();

/**
 * Every origin the app itself answers on, and so every origin allowed to frame
 * a game. The custom domain alone is not enough: the project keeps its
 * `*.vercel.app` hostname too, and a game framed from there would otherwise be
 * refused by the browser with no console error worth reading.
 */
const appOrigins = [
  process.env.NEXT_PUBLIC_SITE_URL,
  process.env.VERCEL_PROJECT_PRODUCTION_URL &&
    `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
  process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
]
  .filter((origin): origin is string => Boolean(origin))
  .map((origin) => origin.replace(/\/$/, ""));

const nextConfig: NextConfig = {
  /**
   * `next dev` binds to `localhost` and rejects dev-asset requests arriving on
   * any other hostname. Locally the player is the same server reached as
   * `127.0.0.1`, which is a different origin to the browser and therefore a
   * different hostname to the dev server — without this the game frame loads
   * its HTML and then fails to fetch a single chunk.
   */
  allowedDevOrigins: playerHostname ? [playerHostname] : undefined,

  /**
   * `headers` are evaluated before the proxy (see the routing order in
   * `next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/rewrites.md`),
   * so `source` here matches the URL as it arrived — `/animal-adventure` on
   * the player host, not the `/player/animal-adventure` the proxy rewrites it
   * to. Matching on `host` instead of path is what makes that irrelevant.
   */
  async headers() {
    if (!playerHostname || appOrigins.length === 0) return [];

    return [
      {
        // The player origin: framed by this app and nobody else. `sandbox` on
        // the iframe governs what a game may do; this governs who may embed
        // it, which is the half the embedding page cannot enforce for itself.
        source: "/:path*",
        has: [{ type: "host", value: playerHostname }],
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${appOrigins.join(" ")}`,
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Game URLs are the only referrer a third-party asset could leak,
          // and they identify the player. Send nothing.
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        // The app origin is never framed by anything.
        source: "/:path*",
        missing: [{ type: "host", value: playerHostname }],
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
