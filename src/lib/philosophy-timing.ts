export const PHILOSOPHY_LOOP_SECONDS = 6.56;

// Source recording: D (8.10–11.55s) starts at 0.5s; B (11.55–14.70s)
// starts at 3.95s in accents-loop.wav. Preserve the recording's beat spacing.
export const PHILOSOPHY_CUES = [
  { time: 1.125, frame: 0 },
  { time: 1.948, frame: 1 },
  { time: 2.771, frame: 2 },
  { time: 4.393, frame: 0 },
  { time: 5.226, frame: 1 },
  { time: 6.039, frame: 2 },
] as const;

const SMEAR_SECONDS = 0.14;

export function philosophyFramePose(seconds: number, frame: number) {
  const time =
    ((seconds % PHILOSOPHY_LOOP_SECONDS) + PHILOSOPHY_LOOP_SECONDS) %
    PHILOSOPHY_LOOP_SECONDS;
  for (let index = 0; index < PHILOSOPHY_CUES.length; index++) {
    const cue = PHILOSOPHY_CUES[index];
    if (cue.frame !== frame) continue;
    const end =
      PHILOSOPHY_CUES[index + 1]?.time ??
      PHILOSOPHY_LOOP_SECONDS + PHILOSOPHY_CUES[0].time;
    // Carry the final graphic over the loop boundary. Only the initial visit
    // gets the empty prohibition intro; subsequent loops never go blank.
    const frameTime =
      index === PHILOSOPHY_CUES.length - 1 &&
      time < PHILOSOPHY_CUES[0].time &&
      seconds >= PHILOSOPHY_LOOP_SECONDS
        ? time + PHILOSOPHY_LOOP_SECONDS
        : time;
    if (frameTime < cue.time - SMEAR_SECONDS || frameTime >= end) continue;

    const entering = Math.min(
      1,
      Math.max(0, (frameTime - cue.time + SMEAR_SECONDS) / SMEAR_SECONDS),
    );
    const leaving = Math.min(
      1,
      Math.max(0, (frameTime - end + SMEAR_SECONDS) / SMEAR_SECONDS),
    );
    const opacity = entering * (1 - leaving);
    const smear = 1 - opacity;
    return {
      opacity,
      blur: smear * 18,
      x: (1 - entering - leaving) * 70,
      stretch: 1 + smear * 0.18,
    };
  }
  return { opacity: 0, blur: 0, x: 0, stretch: 1 };
}
