import cue from "@config/onboarding-cue.json";

export const onboardingBarSeconds = 240 / cue.bpm;
export const onboardingFinalSeconds = cue.stageStartBars[8] * onboardingBarSeconds;
export const onboardingEndSeconds = cue.bars * onboardingBarSeconds;

/** Smooth, deterministic soundtrack fade on the final screen. */
export function onboardingVolumeAt(seconds: number): number {
  if (seconds <= onboardingFinalSeconds) return 0.45;
  const progress = Math.min(1, (seconds - onboardingFinalSeconds) / (onboardingEndSeconds - onboardingFinalSeconds));
  return 0.45 * (1 - progress) ** 2;
}

/** Both the score and the story use the same bar numbers. */
export function onboardingStageAt(seconds: number): number {
  const currentBar = seconds / onboardingBarSeconds;
  let stage = 1;
  for (let index = 2; index < cue.stageStartBars.length; index++) {
    if (currentBar >= cue.stageStartBars[index]) stage = index;
  }
  return stage;
}
