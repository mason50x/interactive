/**
 * The player origin: the one place game code is allowed to run.
 *
 * A game is third-party code. Even one we wrote today is a bundle we will
 * later swap for something a studio shipped, so the rule has to hold for the
 * worst case: anything executing on the app's own origin can read
 * `localStorage`, lift the Clerk session, and call Convex as the signed-in
 * user. Give games a different hostname and the browser enforces the rest —
 * an origin is scheme + host + port, and a document on the far side of that
 * line cannot reach across it no matter what it does with the DOM it is
 * handed.
 *
 * Both origins are the same deployment. The split is a hostname, not a second
 * codebase: `src/proxy.ts` reads the host a request arrived on and rewrites
 * the player host into the `/player` segment. One `git push` ships both.
 */

/** The segment the player host is rewritten into. Never linked directly. */
export const PLAYER_PATH_PREFIX = "/player";

/**
 * The player's own origin, or `null` when this deployment answers on a single
 * hostname.
 *
 * `null` is the un-isolated fallback: games are served from `/player/<slug>`
 * on the app's own origin, which is how a preview deployment and a bare
 * `next dev` work with no configuration at all. It costs the origin boundary,
 * so `GameFrame` drops `allow-same-origin` from the sandbox to compensate —
 * see the note there. Production always sets this.
 */
export function playerOrigin(): string | null {
  const configured = process.env.NEXT_PUBLIC_PLAYER_ORIGIN;
  if (!configured) return null;

  const trimmed = configured.replace(/\/$/, "");
  // A malformed value would otherwise fail deep inside the proxy, where the
  // only symptom is every request 404ing. Fail into the fallback instead.
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

/** Host and port of the player origin, matching an incoming `Host` header. */
export function playerHost(): string | null {
  const origin = playerOrigin();
  return origin ? new URL(origin).host : null;
}

/**
 * The `src` for a game's frame.
 *
 * On the player origin the `/player` prefix is supplied by the proxy, so the
 * public URL of a game is just its slug at the root — which is also what
 * keeps the prefix an implementation detail rather than a public path.
 */
export function playerUrl(slug: string): string {
  const origin = playerOrigin();
  return origin ? `${origin}/${slug}` : `${PLAYER_PATH_PREFIX}/${slug}`;
}
