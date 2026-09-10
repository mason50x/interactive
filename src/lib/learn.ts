/**
 * Where an activity is framed, and the URL that reaches it.
 *
 * ## One origin now
 *
 * An activity used to run on its own hostname — a second origin whose whole job
 * was to keep third-party activity code away from the Clerk session. That split
 * is gone. It bought less than it looked like it did: the untrusted bundle was
 * never on that origin in the first place. A bundle is a static file on the
 * *asset* origin (see `src/lib/assets.ts`), framed from here, and the asset
 * origin is cross-origin to the app whether or not a player host exists. The
 * separate player host only isolated *this* framing page, which is our own
 * code and runs no bundle of its own.
 *
 * So the boundary that actually contains activity code — the asset origin —
 * still stands. What changed is that the framing page (`/learn/<slug>`) now
 * lives on the app's own origin instead of a hostname of its own. That makes
 * an activity a normal page of the site, reachable and gated the way every other
 * signed-in page is, rather than something behind a bespoke grant on a second
 * domain. `src/proxy.ts` protects `/learn` with the session; there is no token
 * in the URL to leak, expire, or mint.
 *
 * ## Why `/learn` and not the bundle directly
 *
 * `ActivityFrame` on a dashboard page could frame the asset bundle straight
 * off. It does not, for the same two reasons the middle frame always existed:
 * the bundle URL would then be ungated (the bucket sits outside the app, so
 * nothing checks a session on the way to it), and `frame-ancestors` has to be
 * sent by the framed document, which a bucket does not do. Keeping `/learn` in
 * the middle means the bundle URL is only ever handed to a page that already
 * required a session, and the app controls who may embed it.
 */

/** The path an activity is framed at. Not linked in navigation — reached only by
 *  being framed from its dashboard page. */
export const LEARN_PATH_PREFIX = "/learn";

/**
 * The `src` for an activity's frame: its slug under `/learn`, on the app's own
 * origin. The session gates it in `src/proxy.ts`, so an unauthenticated load
 * is bounced to sign-in rather than served.
 */
export function activityFrameSrc(slug: string): string {
  return `${LEARN_PATH_PREFIX}/${encodeURIComponent(slug)}`;
}
