/**
 * Durations and elapsed time, as the dashboard says them.
 *
 * Everything the home page counts arrives as a number of seconds or a
 * millisecond timestamp, and none of it wants `Intl.RelativeTimeFormat`'s
 * output. That formatter is right when the exact interval is the point — a
 * deadline, a token expiry — and this is the other case: nobody needs to know
 * they opened something 97 minutes ago, they need to know it was earlier
 * today. So the buckets are coarse on purpose, and they get coarser the
 * further back you look.
 */

const MINUTE = 60;
const HOUR = 60 * MINUTE;

/**
 * Seconds as a span someone would say out loud: `"6m"`, `"1h 20m"`, `"14h"`.
 *
 * Under a minute reads as `"<1m"` rather than as a count of seconds. A card
 * showing `47s` invites you to watch it tick; the point of the number is the
 * shape of the day, and at that size the shape is "barely any".
 *
 * The minutes are dropped once there are hours *and* the minutes are zero,
 * which is the only case where `"3h 0m"` would be worse than `"3h"`.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0m";
  if (seconds < MINUTE) return "<1m";

  const hours = Math.floor(seconds / HOUR);
  const minutes = Math.floor((seconds % HOUR) / MINUTE);

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * The same span split for a stat tile, where the number and its unit are set
 * at different sizes and so cannot be one string.
 *
 * Returns hours when there are any, minutes otherwise — a tile has room for
 * one number, and `"2"` over `"hours"` is the one that reads at a glance.
 */
export function splitDuration(seconds: number): {
  value: string;
  unit: string;
} {
  if (!Number.isFinite(seconds) || seconds < MINUTE) {
    return { value: "0", unit: "minutes" };
  }

  if (seconds < HOUR) {
    const minutes = Math.floor(seconds / MINUTE);
    return { value: `${minutes}`, unit: minutes === 1 ? "minute" : "minutes" };
  }

  // One decimal up to ten hours, because the difference between 2h and 2.5h is
  // most of an afternoon and `"2"` would hide it. Past that the fraction stops
  // being interesting and the tile is better off short.
  const hours = seconds / HOUR;
  if (hours < 10) {
    const rounded = Math.round(hours * 10) / 10;
    return {
      value: Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1),
      unit: rounded === 1 ? "hour" : "hours",
    };
  }

  return { value: `${Math.round(hours)}`, unit: "hours" };
}

/**
 * How long ago, in the words a card uses: `"just now"`, `"12 minutes ago"`,
 * `"yesterday"`, `"3 days ago"`, `"6 Aug"`.
 *
 * It stops counting days at a fortnight and falls back to the date, because
 * past that "19 days ago" is arithmetic the reader has to do to get back to a
 * day they can picture.
 *
 * `now` is a parameter rather than a call to `Date.now()` inside, so a list of
 * rows is all measured against the same instant — otherwise two cards rendered
 * a millisecond apart can straddle a boundary and disagree.
 */
export function formatSince(atMs: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - atMs) / 1000));

  if (seconds < 90) return "just now";
  if (seconds < HOUR) {
    const minutes = Math.round(seconds / MINUTE);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (seconds < 22 * HOUR) {
    const hours = Math.round(seconds / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.round(seconds / (24 * HOUR));
  if (days <= 1) return "yesterday";
  if (days <= 14) return `${days} days ago`;

  return new Date(atMs).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}
