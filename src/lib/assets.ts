/**
 * The asset origin: where hosted game bundles are served from.
 *
 * These are not in the repo and never reach a Vercel deployment. There are
 * ~18,000 files and 5.4 GB of them, which is past the 15,000-file deployment
 * limit on its own, and serving them from Vercel would bill every megabyte as
 * Fast Data Transfer. They live in a Cloudflare R2 bucket instead, which has
 * no egress charge, and this module is the only thing that knows the URL.
 *
 * ## What this origin is not
 *
 * It is not gated. `src/lib/player-token.ts` mints a grant, and `src/proxy.ts`
 * verifies it, but the proxy only sees requests to *this deployment* — a
 * request straight to the bucket never passes through it. The README has
 * always flagged this gap for a real asset pipeline; this is that pipeline, so
 * state the consequence plainly: **anyone who learns a bundle URL can fetch it
 * without signing in.** The grant still gates the page that frames the game,
 * so the catalogue, the dashboard, and every score path stay behind the
 * session; what is public is the static bundle itself, which is upstream's
 * freely-downloadable content in the first place.
 *
 * Closing that gap means signed bucket URLs with a short expiry, minted next
 * to the grant. Worth doing if anything private ever lands in the bucket. It
 * is not worth doing for a copy of a public archive, so it is deliberately
 * not done yet.
 *
 * ## Why a separate origin from the player
 *
 * The player origin already exists to keep game code away from the Clerk
 * session (see `src/lib/player.ts`). The asset origin is a third host, and the
 * boundary that matters is still the player's: a bundle is *framed* by the
 * player origin, so it inherits that document's origin for anything it tries
 * to reach. The bucket is a file server, not a security boundary.
 */

/** Where a hosted game's own files sit, under the asset origin. */
export const GAMES_PREFIX = "games";

/**
 * Tile art is deliberately *not* here. It lives in `public/` and is served by
 * the app — 318 files and under 2 MB, small enough that the reasons this
 * module exists do not apply to it, and worth keeping local so the catalogue
 * still renders when the bucket does not. See `THUMBNAIL_PATH` in
 * `src/lib/games.ts`.
 */

/**
 * The asset origin, or `null` when none is configured.
 *
 * `null` is not a working state for hosted games — there is nowhere to load
 * them from — so callers treat it as "hosted games are unavailable" rather
 * than falling back to a local path that would 404 for every one of them. The
 * authored React games are unaffected and keep working, which is what makes a
 * bare `next dev` with no bucket still useful.
 */
export function assetOrigin(): string | null {
  const configured = process.env.NEXT_PUBLIC_ASSET_ORIGIN;
  if (!configured) return null;

  // A malformed value would otherwise surface as every tile showing a broken
  // image and every game framing a 404, with nothing naming the cause.
  try {
    return new URL(configured.replace(/\/$/, "")).origin;
  } catch {
    return null;
  }
}

/** The entry document for a hosted game, or `null` with no asset origin. */
export function gameBundleUrl(slug: string): string | null {
  const origin = assetOrigin();
  return origin ? `${origin}/${GAMES_PREFIX}/${slug}/index.html` : null;
}
