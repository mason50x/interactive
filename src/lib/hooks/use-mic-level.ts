import { useEffect, useRef } from "react";

/**
 * How loud the microphone is, as a handful of numbers per animation frame.
 *
 * ## Why a second stream
 *
 * The speech recogniser (`useDictation`) opens the microphone itself and
 * shows nothing of what it hears. A waveform that moves with the voice has
 * to listen on its own, so this opens a second stream into an `AnalyserNode`
 * and reads it every frame. By the time this mounts, the recogniser has
 * already been granted the microphone for this origin in the tap that
 * started it, so `getUserMedia` resolves without a second prompt.
 *
 * ## Why bands and not one level
 *
 * One number from the whole signal moves every bar together and reads as a
 * volume meter. Splitting the spectrum into a band per bar gives each its
 * own life, which is what a waveform icon promises. The bins kept are
 * roughly 190 Hz to 3.4 kHz — where speech puts its energy — and the rest of
 * the spectrum is left out rather than left flat.
 *
 * ## Why nothing here is state
 *
 * Sixty renders a second is a bad way to move five bars. The levels go to
 * the caller through a callback, and the caller writes them straight to the
 * DOM. The analyser's own smoothing plus a fast-attack, slow-decay blend on
 * top keeps it lively without jitter.
 *
 * The loop only runs while `active`; the caller decides that from
 * `useStillness()`, because a `requestAnimationFrame` loop is one of the
 * things the blanket reduced-motion rule in CSS cannot reach. The stream
 * and the audio context are both closed on cleanup, so the tab's microphone
 * light goes out the moment the bars do. A failure to open the microphone
 * is swallowed: no bars, but dictation carries on.
 */

/** 128 bins at 48 kHz is about 187 Hz each. */
const FFT_SIZE = 256;
/** Bin range that carries a voice. */
const LOW_BIN = 1;
const HIGH_BIN = 18;
/** Speech seldom nears full scale; lift it before clamping. */
const GAIN = 1.6;
const ATTACK = 0.5;
const DECAY = 0.2;

export function useMicLevel({
  active,
  bands,
  onFrame,
}: {
  active: boolean;
  bands: number;
  /** Called every frame with `bands` numbers in 0..1. The array is reused. */
  onFrame: (levels: Float32Array) => void;
}) {
  const frame = useRef(onFrame);
  useEffect(() => {
    frame.current = onFrame;
  });

  useEffect(() => {
    if (!active) return;
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      return;
    }

    // Set if the effect is torn down before the promise settles, which is
    // what StrictMode's double mount and a quick unmount both look like.
    let cancelled = false;
    let raf = 0;
    let context: AudioContext | null = null;
    let stream: MediaStream | null = null;

    void navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((got) => {
        if (cancelled) {
          got.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = got;
        context = new AudioContext();
        // Safari can hand one over suspended; the gesture is still fresh.
        void context.resume();
        const analyser = context.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0.75;
        // Into the analyser and nowhere else: never the speakers.
        context.createMediaStreamSource(got).connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);
        const levels = new Float32Array(bands);
        const width = (HIGH_BIN - LOW_BIN) / bands;

        const tick = () => {
          analyser.getByteFrequencyData(data);
          for (let band = 0; band < bands; band++) {
            const from = Math.floor(LOW_BIN + band * width);
            const to = Math.max(
              from + 1,
              Math.floor(LOW_BIN + (band + 1) * width),
            );
            let sum = 0;
            for (let i = from; i < to; i++) sum += data[i];
            const mean = sum / ((to - from) * 255);
            const target = Math.min(1, mean * GAIN);
            const rate = target > levels[band] ? ATTACK : DECAY;
            levels[band] += (target - levels[band]) * rate;
          }
          frame.current(levels);
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      })
      .catch(() => {
        // No bars. Dictation does not depend on this.
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close();
    };
  }, [active, bands]);
}
