import { describe, expect, test } from "vitest";
import { formatSince, splitDuration } from "@/lib/time";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("splitDuration", () => {
  test.each([
    [Number.NaN, "0", "minutes"],
    [Number.POSITIVE_INFINITY, "0", "minutes"],
    [Number.NEGATIVE_INFINITY, "0", "minutes"],
    [-5, "0", "minutes"],
    [0, "0", "minutes"],
    [59, "0", "minutes"],
  ])(
    "non-finite or sub-minute input %s reads as zero minutes",
    (seconds, value, unit) => {
      expect(splitDuration(seconds)).toEqual({ value, unit });
    },
  );

  test.each([
    [MINUTE, "1", "minute"],
    [2 * MINUTE - 1, "1", "minute"],
    [2 * MINUTE, "2", "minutes"],
    [HOUR - 1, "59", "minutes"],
  ])(
    "under an hour %d s floors to whole minutes with a singular at one",
    (seconds, value, unit) => {
      expect(splitDuration(seconds)).toEqual({ value, unit });
    },
  );

  test.each([
    [HOUR, "1", "hour"],
    [HOUR + 10, "1", "hour"],
    [HOUR + 3 * MINUTE, "1.1", "hours"],
    [1.5 * HOUR, "1.5", "hours"],
    [2 * HOUR, "2", "hours"],
    [2.5 * HOUR, "2.5", "hours"],
    [9.94 * HOUR, "9.9", "hours"],
  ])(
    "under ten hours %d s keeps one decimal and drops a trailing .0",
    (seconds, value, unit) => {
      expect(splitDuration(seconds)).toEqual({ value, unit });
    },
  );

  test.each([
    [10 * HOUR, "10", "hours"],
    [10.4 * HOUR, "10", "hours"],
    [10.5 * HOUR, "11", "hours"],
    [100 * HOUR, "100", "hours"],
  ])(
    "at or past ten hours %d s rounds to a whole hour",
    (seconds, value, unit) => {
      expect(splitDuration(seconds)).toEqual({ value, unit });
    },
  );

  test("9.97 hours rounds up to a whole ten without a decimal", () => {
    expect(splitDuration(9.97 * HOUR)).toEqual({ value: "10", unit: "hours" });
  });
});

describe("formatSince", () => {
  const now = Date.UTC(2026, 8, 14, 12, 0, 0);
  const ago = (seconds: number) => now - seconds * 1000;

  test.each([
    [0, "just now"],
    [89, "just now"],
    [90, "2 minutes ago"],
    [10 * MINUTE, "10 minutes ago"],
    [HOUR - 1, "60 minutes ago"],
    [HOUR, "1 hour ago"],
    [1.5 * HOUR, "2 hours ago"],
    [21.4 * HOUR, "21 hours ago"],
    [22 * HOUR - 1, "22 hours ago"],
    [22 * HOUR, "yesterday"],
    [35 * HOUR, "yesterday"],
    [36 * HOUR, "2 days ago"],
    [14 * DAY, "14 days ago"],
    [14.4 * DAY, "14 days ago"],
  ])("%d seconds ago reads as %s", (seconds, expected) => {
    expect(formatSince(ago(seconds), now)).toBe(expected);
  });

  test("the singular minute is unreachable: 90 s already rounds to two", () => {
    // Everything under 90 s is "just now" and 90 s / 60 = 1.5 rounds up, so
    // no input produces "1 minute ago".
    for (let seconds = 0; seconds < 2 * HOUR; seconds += 1) {
      expect(formatSince(ago(seconds), now)).not.toBe("1 minute ago");
    }
  });

  test.each([14.5 * DAY, 15 * DAY, 400 * DAY])(
    "past a fortnight (%d s) falls back to the day and month of the instant",
    (seconds) => {
      const at = ago(seconds);
      const expected = new Date(at).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      });
      expect(formatSince(at, now)).toBe(expected);
      expect(formatSince(at, now)).not.toMatch(/ago|yesterday|just now/);
    },
  );

  test("an instant in the future is clamped to just now", () => {
    expect(formatSince(now + 5 * DAY * 1000, now)).toBe("just now");
  });

  test("the same instant is measured against whichever now is supplied", () => {
    const at = ago(3 * DAY);
    expect(formatSince(at, now)).toBe("3 days ago");
    expect(formatSince(at, now + 2 * DAY * 1000)).toBe("5 days ago");
    expect(formatSince(at, at)).toBe("just now");
  });

  test("now defaults to the current time", () => {
    expect(formatSince(Date.now())).toBe("just now");
  });
});
