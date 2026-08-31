/**
 * The single source of truth for the brand: name, voice, canonical URL, and
 * the geometry of the IL monogram. Everything else — the favicon, the app
 * icons, the OG image, the header lockup, the JSON-LD — is derived from here,
 * so the brand can only ever be changed in one place.
 *
 * The domain is not spelled out here. `url` resolves from
 * `NEXT_PUBLIC_SITE_URL` and falls back to `config/domains.json`, which is the
 * only place in the repo a domain literal lives, and `domain` is derived from
 * `url` rather than stored beside it. That derivation is the point: the role
 * addresses in `src/lib/legal.ts` and `src/lib/content.ts` are built on
 * `domain`, so a stored copy would go stale the moment the site moved and the
 * symptom would be a privacy policy quoting an address that no longer accepts
 * mail. See `config/domains.md`.
 */

import domains from "../../config/domains.json";

/** The site's own origin, most-explicit first. Preview deployments set nothing
 *  and resolve their own host at runtime — see `src/lib/site-url.ts`, which
 *  does the same walk for the invitation links that must not guess wrong. */
function resolveUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL ?? domains.site;
  return configured.replace(/\/$/, "");
}

/**
 * Hosts that are a deployment, not a brand.
 *
 * `url` is whatever origin this deployment answers on, which on a preview is a
 * generated `*.vercel.app` name and locally is `localhost:3000`. Those are
 * correct answers for a canonical URL and useless ones for an email address:
 * a privacy policy is a document a reader may act on, and rendering
 * `privacy@localhost:3000` in one is worse than rendering a stale domain,
 * because the stale domain at least looks like something a person could write
 * to. So the derivation covers the production case and declines the rest.
 */
function isDeploymentHost(host: string): boolean {
  return (
    host === "localhost" ||
    host.startsWith("localhost:") ||
    host.startsWith("127.0.0.1") ||
    host.endsWith(".vercel.app")
  );
}

/**
 * The bare domain the role addresses sit on.
 *
 * Derived from `url`, with `NEXT_PUBLIC_BRAND_DOMAIN` as the escape hatch for
 * the one case where the two genuinely differ: a cutover where the site has
 * moved and mail has not. Without that override the choice would be between
 * moving both at once or hard-coding one of them again — and hard-coding is
 * exactly what leaves a privacy policy quoting an address that stopped
 * accepting mail two domains ago.
 */
function resolveDomain(url: string): string {
  const override = process.env.NEXT_PUBLIC_BRAND_DOMAIN ?? domains.mail;
  if (override) return override.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const fallback = new URL(domains.site).host;
  try {
    const host = new URL(url).host;
    return isDeploymentHost(host) ? fallback : host;
  } catch {
    return fallback;
  }
}

const url = resolveUrl();

export const brand = {
  name: "Interactive Learning",
  /** Used where the full name will not fit: app icon labels, tab titles. */
  shortName: "Interactive",
  tagline: "The visual learning platform",
  description:
    "Interactive Learning turns dense course material into concept maps, animated walkthroughs, and practice that adapts to what you have not understood yet.",
  /** Kept short enough to survive Google's ~155 character description clamp. */
  metaDescription:
    "Turn dense course material into concept maps, animated walkthroughs, and practice that adapts to what you have not understood yet.",
  domain: resolveDomain(url),
  url,
  locale: "en_US",
  keywords: [
    "interactive learning",
    "visual learning platform",
    "concept maps",
    "study tools",
    "adaptive practice",
    "spaced repetition",
    "online learning",
    "study groups",
  ],
  colors: {
    /** The monogram is always pure black on pure white — never tinted. */
    ink: "#0f0f0f",
    paper: "#ffffff",
    /** Browser chrome colour, per theme. */
    themeLight: "#ffffff",
    themeDark: "#0f0f0f",
  },
} as const;

/**
 * The IL monogram, on a 100x100 canvas.
 *
 * The proportions are lifted directly off Inter Black rather than eyeballed:
 * rendering the glyphs at 1000upm gives a cap height of 728, a stem of 198,
 * an L arm of 295 past the stem, and a 159 foot. Scaled by 58/728 those land
 * on the numbers below, so the mark reads as genuine Inter rather than as a
 * generic pair of bars.
 *
 * The I and the L are joined by a hairline web at the baseline. Running the
 * L's foot the whole way under the I was the first attempt and it fails: it
 * gives the I a foot of its own, so the pair reads as "U". Cutting the
 * counter down to within 4.5 units of the baseline leaves both letters
 * intact and makes the join a deliberate detail. At favicon sizes the web
 * falls below a pixel and the mark degrades gracefully into a tight "IL".
 */
export const monogram = {
  viewBox: "0 0 100 100",
  /** Corner radius of the containing tile, in canvas units. */
  tileRadius: 20,
  /**
   *  M18 21 H33.77 V74.5 H42.73 V21 H58.5 V66.33 H82 V79 H18 Z
   *  |I stem||counter, cut to the web||L stem||L arm||foot|
   */
  path: "M18 21H33.77V74.5H42.73V21H58.5V66.33H82V79H18Z",
} as const;
