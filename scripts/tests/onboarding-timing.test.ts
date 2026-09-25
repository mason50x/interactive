import { expect, test } from "vitest";
import cue from "../../config/onboarding-cue.json";
import {
  onboardingBarSeconds,
  onboardingEndSeconds,
  onboardingFinalSeconds,
  onboardingStageAt,
  onboardingVolumeAt,
} from "../../src/lib/onboarding-timing";

test("the burst, content, and final invitation begin on soundtrack downbeats", () => {
  expect(onboardingStageAt(0)).toBe(1);
  for (let stage = 2; stage <= 8; stage++) {
    const cut = cue.stageStartBars[stage] * onboardingBarSeconds;
    expect(onboardingStageAt(cut - 0.001)).toBe(stage - 1);
    expect(onboardingStageAt(cut + 0.001)).toBe(stage);
  }
  expect(onboardingStageAt(cue.bars * onboardingBarSeconds)).toBe(8);
});

test("the soundtrack fades to silence during the final screen", () => {
  expect(onboardingVolumeAt(onboardingFinalSeconds)).toBe(0.45);
  expect(onboardingVolumeAt((onboardingFinalSeconds + onboardingEndSeconds) / 2)).toBeCloseTo(0.1125);
  expect(onboardingVolumeAt(onboardingEndSeconds)).toBe(0);
});
