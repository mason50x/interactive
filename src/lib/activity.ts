/**
 * What one activity is, and the things you can work out from one on its own.
 *
 * This is the half of the catalogue that is safe to ship to a browser: a type,
 * and three pure functions that take an activity — or a list of them — and
 * return something derived from it. None of it reads the catalogue.
 *
 * That is the whole reason the split exists. `activities.ts` imports the
 * generated JSON, so anything that imports *it* pulls all 318 entries in with
 * it — and a `"use client"` module doing that puts the catalogue in a
 * `/_next/static` chunk, which is served to anyone who asks, session or no
 * session. So `activities.ts` is `server-only` and the client gets its
 * activities the one way that stays behind the session: as props, serialised
 * into the RSC payload of a route that has already called `auth.protect()`.
 *
 * Singular here, plural there, and the distinction is the rule: this module is
 * the shape of an activity, that one is the set of them.
 */

/**
 * The six the catalogue is organised into.
 *
 * Not upstream's own vocabulary. Their tags name a *form* — the shape an
 * activity takes — and these name what it asks of the person doing it, which
 * is the more useful axis for a catalogue somebody browses to pick something
 * up. `GENRE_ALIASES` in `scripts/build-catalogue.mjs` is where the two are
 * reconciled, and it is total: an upstream tag with no mapping stops the build
 * rather than reaching a catalogue that has no label or colour for it.
 */
export type Genre =
  | "coordination"
  | "exploration"
  | "problem-solving"
  | "reaction"
  | "systems"
  | "touch";

export type Activity = {
  slug: string;
  /** Shown in the rail, on the tile, and as the page heading. */
  title: string;
  genre: Genre;
  /**
   * Position in the catalogue, ascending, and the app's only popularity
   * signal — upstream hand-orders its index most-viewed first and this
   * preserves that. `POPULAR_COUNT` slices the head of it.
   */
  rank: number;
  /** Filename under `public/thumbnails`. All of them are 480x100. */
  thumbnail: string;
  /** Directory size upstream, for the migration script's accounting. */
  bytes: number;
};

/**
 * Tile art, served from `public/` rather than from the asset bucket.
 *
 * The bundles are in R2 because they are 4.85 GB and would blow both the
 * deployment file limit and the bandwidth allowance. The thumbnails are the
 * opposite case on every axis: 318 files and under 2 MB in total, six
 * kilobytes each. Against a 15,000-file deployment limit and a 100 GB monthly
 * transfer allowance, that is not a cost worth engineering around.
 *
 * What it buys is a failure mode. The grid is the app's own chrome, not activity
 * content — so when the bucket is unreachable or misconfigured, the catalogue
 * should still render correctly and fail only at the point of opening one.
 * Art loaded from the bucket makes an asset-origin problem look like a broken
 * page; art loaded from here keeps the blast radius at the thing that is
 * actually broken.
 *
 * It also makes the art atomic with the catalogue: both are in the same
 * commit, so a tile can never reference a thumbnail that a later migration
 * has not uploaded yet.
 *
 * The art itself is public and stays that way. A thumbnail is a file in
 * `public/`, reachable by URL by anyone who knows it, which is the same deal
 * every static asset in the app gets. What the split above protects is the
 * *index* — the list of what exists and what it is called — not the pictures.
 */
export const THUMBNAIL_PATH = "/thumbnails";

/** Where an activity's tile art lives. */
export function thumbnailSrc(activity: Activity): string {
  return `${THUMBNAIL_PATH}/${activity.thumbnail}`;
}

/**
 * The line a tile shows under its title.
 *
 * The catalogue carries no per-activity copy — upstream writes a title and nothing
 * else — so rather than invent a blurb this states the one fact we do have:
 * where the activity sits in upstream's hand-ordered, most-viewed-first index.
 */
export function popularityLabel(activity: Activity): string {
  return `#${activity.rank + 1} most viewed`;
}

/** Lower-cased and stripped of everything but letters and digits, so that
 *  "papa's" matches "papas" and "run 3" matches "run3". */
function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Substring search over title, slug, and genre, preserving the given order.
 *
 * Deliberately not fuzzy. With a few hundred short titles a plain contains-
 * match is both predictable and instant, and the ranking that matters — the
 * popular ones first — is already carried by the array's order. An empty
 * query is not a search and returns the list untouched.
 *
 * It takes the list rather than reaching for one, which is what lets the same
 * function run on the server against `ACTIVITIES` and in the browser against
 * whatever slice of it a component was handed.
 */
export function filterActivities(
  activities: readonly Activity[],
  query: string,
): readonly Activity[] {
  const needle = normalise(query);
  if (!needle) return activities;
  return activities.filter((activity) =>
    normalise(`${activity.title} ${activity.slug} ${activity.genre}`).includes(needle),
  );
}
