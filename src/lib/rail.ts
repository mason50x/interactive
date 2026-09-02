/**
 * Which width the rail is at, remembered per browser.
 *
 * `AppSidebar` is a column of labelled rows at `lg` and up and a column of
 * icons below it, and at `lg` it can be put into the icon form on purpose: an
 * activity is wider than it is tall, and the 15rem beside it is the first
 * thing anyone gives up. That choice is a cookie and not a row in the
 * account's settings, for two reasons. It is a fact about this screen rather
 * than this person — the same account on a laptop and on a monitor wants
 * different answers, and a setting that followed you between them would be
 * wrong on one of them. And the dashboard layout reads it on the server, so
 * the rail is drawn at the remembered width in the first frame rather than
 * jumping there once React is up, which nothing in `localStorage` could do.
 *
 * The value is the attribute `AppSidebar` writes to its `<nav>` and the
 * `wide:` / `narrow:` / `collapsed:` variants in `globals.css` read. See the
 * note above those for the vocabulary.
 */
export const RAIL_COOKIE = "il-rail";

export type RailState = "open" | "closed";

/** A year. It is a preference, not a session. */
const RAIL_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * The state a cookie value stands for. Anything but an explicit `closed`,
 * including no cookie at all, is open: the wide rail is the default, and a
 * value this code never wrote should not be able to take it away.
 */
export function railState(value: string | undefined): RailState {
  return value === "closed" ? "closed" : "open";
}

/** Remember `state` for this browser. Browser only. */
export function rememberRailState(state: RailState) {
  document.cookie = `${RAIL_COOKIE}=${state}; path=/; max-age=${RAIL_COOKIE_MAX_AGE}; samesite=lax`;
}
