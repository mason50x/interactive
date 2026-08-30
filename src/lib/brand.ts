/**
 * The single source of truth for the brand: name, voice, canonical URL, and
 * the geometry of the IL monogram. Everything else — the favicon, the app
 * icons, the OG image, the header lockup, the JSON-LD — is derived from here,
 * so the brand can only ever be changed in one place.
 */

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
  domain: "interactivelearningresources.org",
  url:
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://interactivelearningresources.org",
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
