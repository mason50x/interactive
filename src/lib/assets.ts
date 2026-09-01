/**
 * The asset origin: where hosted activity bundles are served from.
 *
 * These are not in the repo and never reach a Vercel deployment. There are
 * ~18,000 files and 5.4 GB of them, which is past the 15,000-file deployment
 * limit on its own, and serving them from Vercel would bill every megabyte as
 * Fast Data Transfer. They live in a Cloudflare R2 bucket instead, which has
 * no egress charge, and this module is the only thing that knows the URL.
 *
 * ## What this origin is not
 *
 * It is not gated. `src/proxy.ts` protects `/learn`, the page that frames a
 * activity, but the proxy only sees requests to *this deployment* — a request
 * straight to the bucket never passes through it. The README has always
 * flagged this gap for a real asset pipeline; this is that pipeline, so state
 * the consequence plainly: **anyone who learns a bundle URL can fetch it
 * without signing in.** The session still gates the page that hands the URL
 * out, so the catalogue, the dashboard, and every score path stay behind it;
 * what is public is the static bundle itself, which is upstream's
 * freely-downloadable content in the first place.
 *
 * Closing that gap means signed bucket URLs with a short expiry. Worth doing
 * if anything private ever lands in the bucket. It is not worth doing for a
 * copy of a public archive, so it is deliberately not done yet.
 *
 * ## Why the bundles get an origin of their own
 *
 * A bundle is third-party code, and this is the origin that contains it. The
 * app frames a bundle from `/learn` (see `src/lib/learn.ts`), and because the
 * bundle sits on this separate host it is cross-origin to everything of ours —
 * the browser keeps it from reaching the session no matter what it does with
 * the document it is handed. That boundary is the whole security model now
 * that the framing page shares the app's origin; the bucket itself is a file
 * server, not a boundary, but the origin it answers on is.
 */

/** Where a hosted activity's own files sit, under the asset origin. */
export const ACTIVITIES_PREFIX = "activities";

/**
 * Tile art is deliberately *not* here. It lives in `public/` and is served by
 * the app — 318 files and under 2 MB, small enough that the reasons this
 * module exists do not apply to it, and worth keeping local so the catalogue
 * still renders when the bucket does not. See `THUMBNAIL_PATH` in
 * `src/lib/activity.ts`.
 */

/**
 * The asset origin, or `null` when none is configured.
 *
 * `null` is not a working state for hosted activities — there is nowhere to load
 * them from — so callers treat it as "hosted activities are unavailable" rather
 * than falling back to a local path that would 404 for every one of them. The
 * authored React activities are unaffected and keep working, which is what makes a
 * bare `next dev` with no bucket still useful.
 *
 * ## Why two variable names
 *
 * `ASSET_ORIGIN` is the one to set. This module has exactly one importer —
 * `src/app/learn/[slug]/page.tsx`, a server component — so the origin has no
 * business being in the client bundle, and an unprefixed variable is read at
 * runtime rather than inlined into every build. `NEXT_PUBLIC_ASSET_ORIGIN` is
 * still honoured because it is what is set today and what `vercel env pull`
 * has already written into `.env.local`; a rename that broke every existing
 * environment would defeat the point of the rename.
 *
 * There is deliberately no fallback literal. A stale default would keep
 * serving the *old* bucket after a move, and that failure is silent — the
 * catalogue renders, the tiles render, and only the bundles are wrong. Unset
 * is a state `npm run domains` reports; wrong is a state nothing can detect.
 * See `config/domains.md` for what a move actually costs.
 *
 * The candidates are tried in order and the first one that *parses* wins,
 * rather than the first one that exists. The difference is not academic:
 * `vercel env pull` writes the literal string `[SENSITIVE]` for a variable
 * marked as a Secret, and a variable holding a public bucket hostname gets
 * marked that way easily — the CLI defaults to it for anything unprefixed.
 * Preferring an unparseable value over a working one behind it would take
 * every hosted activity off the site, with the valid origin sitting unused in
 * the next variable along.
 */
export function assetOrigin(): string | null {
  for (const candidate of [
    process.env.ASSET_ORIGIN,
    process.env.NEXT_PUBLIC_ASSET_ORIGIN,
  ]) {
    if (!candidate) continue;

    // A malformed value would otherwise surface as every tile showing a broken
    // image and every activity framing a 404, with nothing naming the cause.
    try {
      return new URL(candidate.replace(/\/$/, "")).origin;
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * The entry document for a hosted activity, or `null` with no asset origin.
 *
 * Takes the activity's `path`, not its slug. The bucket directory is the slug
 * reversed — `crossy` lives at `activities/yssorc/` — and the catalogue carries
 * that as its own field so nothing here has to know the rule. See `path` on
 * `Activity` in `src/lib/activity.ts`.
 */
export function activityBundleUrl(path: string): string | null {
  const origin = assetOrigin();
  return origin ? `${origin}/${ACTIVITIES_PREFIX}/${path}/index.html` : null;
}
