import { expect, test } from "vitest";
import {
  availablePlaytimeSeconds,
  stablePlaytimeSeconds,
} from "../../src/lib/playtime-display";

test("the displayed balance never exceeds the allowance during a lease transition", () => {
  const now = 1_000_000;
  expect(
    availablePlaytimeSeconds(
      {
        remainingSeconds: 1800,
        allowanceSeconds: 1800,
        leaseUntil: now + 12_000,
      },
      now,
    ),
  ).toBe(1800);
  expect(
    availablePlaytimeSeconds(
      {
        remainingSeconds: 1785,
        allowanceSeconds: 1800,
        leaseUntil: now + 12_000,
      },
      now,
    ),
  ).toBe(1797);
  expect(
    availablePlaytimeSeconds(
      { remainingSeconds: 0, allowanceSeconds: 1800, leaseUntil: now - 1000 },
      now,
    ),
  ).toBe(0);
});

test("a stale active lease cannot make the countdown jump upward", () => {
  const previous = {
    remaining: 720,
    allowanceSeconds: 1800,
    resetsAt: 2_000_000,
  };
  const status = {
    allowanceSeconds: 1800,
    resetsAt: 2_000_000,
    leaseUntil: 1_012_000,
  };
  expect(stablePlaytimeSeconds(725, status, 1_000_000, previous)).toBe(720);
  expect(stablePlaytimeSeconds(717, status, 1_000_000, previous)).toBe(717);
  expect(
    stablePlaytimeSeconds(
      120,
      { ...status, allowanceSeconds: 1920 },
      1_000_000,
      previous,
    ),
  ).toBe(120);
  expect(
    stablePlaytimeSeconds(
      1800,
      { ...status, resetsAt: 3_000_000 },
      1_000_000,
      previous,
    ),
  ).toBe(1800);
});
