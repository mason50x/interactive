import { expect, test } from "vitest";
import { RATES, TRUST, type Tier } from "@convex/moderation/limits";
import { overRate, tierFor } from "@convex/moderation/rate";

const NOW = 100 * 24 * 60 * 60 * 1000;

test.each([
  // Either being new by age or by volume is enough to be fresh.
  [TRUST.freshUntilMs - 1, 1_000_000, "fresh"],
  [TRUST.trustedAfterMs, TRUST.freshUntilMessages - 1, "fresh"],
  [0, 0, "fresh"],
  // Both thresholds met exactly stops being fresh.
  [TRUST.freshUntilMs, TRUST.freshUntilMessages, "regular"],
  // Trusted needs both, and one short of either is still regular.
  [TRUST.trustedAfterMs - 1, TRUST.trustedAfterMessages, "regular"],
  [TRUST.trustedAfterMs, TRUST.trustedAfterMessages - 1, "regular"],
  [TRUST.trustedAfterMs, TRUST.trustedAfterMessages, "trusted"],
  [TRUST.trustedAfterMs * 10, TRUST.trustedAfterMessages * 10, "trusted"],
] as const)(
  "tierFor with age %sms and %s messages is %s",
  (age, messagesSent, tier) => {
    expect(tierFor(NOW - age, messagesSent, NOW)).toBe(tier);
  },
);

const tiers = Object.keys(RATES) as Tier[];

const sendsAgo = (count: number, age: number) =>
  Array.from({ length: count }, () => ({ at: NOW - age }));

test.each(tiers)("%s: the short window refuses at exactly its count", (tier) => {
  const [short] = RATES[tier];
  expect(overRate(sendsAgo(short.count - 1, 1), tier, NOW)).toBe(false);
  expect(overRate(sendsAgo(short.count, 1), tier, NOW)).toBe(true);
  expect(overRate(sendsAgo(short.count, short.ms - 1), tier, NOW)).toBe(true);
  // A send exactly `ms` old has left the window.
  expect(overRate(sendsAgo(short.count, short.ms), tier, NOW)).toBe(false);
});

test.each(tiers)("%s: the long window catches a flood that stays under the short one", (tier) => {
  const [short, long] = RATES[tier];
  // All older than the short window, all inside the long one.
  const age = short.ms + 1;
  expect(overRate(sendsAgo(long.count - 1, age), tier, NOW)).toBe(false);
  expect(overRate(sendsAgo(long.count, age), tier, NOW)).toBe(true);
  expect(overRate(sendsAgo(long.count, long.ms), tier, NOW)).toBe(false);
});

test("an empty ring is never over the rate", () => {
  for (const tier of tiers) expect(overRate([], tier, NOW)).toBe(false);
});

test("a tier only ever relaxes the windows", () => {
  const sends = sendsAgo(RATES.regular[0].count, 1);
  expect(overRate(sends, "fresh", NOW)).toBe(true);
  expect(overRate(sends, "regular", NOW)).toBe(true);
  expect(overRate(sends, "trusted", NOW)).toBe(false);
  for (const tier of tiers) {
    expect(RATES[tier][0].count).toBeLessThanOrEqual(RATES.trusted[0].count);
    expect(RATES[tier][1].count).toBeLessThanOrEqual(RATES.trusted[1].count);
  }
});
