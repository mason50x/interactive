/**
 * Every remote sound, synthesised in the browser.
 *
 * Nothing here is a recording: each effect is a handful of oscillators and
 * filtered noise scheduled on a fresh `AudioContext`, which is why the
 * catalogue can be silly without a licensing question per file. Each effect
 * takes a `Voice` — the context, the node to play into and the moment to
 * start — and returns how many seconds it needs, so the context can be closed
 * once it has gone quiet.
 *
 * ## Volume
 *
 * The chain is master gain → soft limiter → speakers. The gain is the chosen
 * percentage, so 200% really does double the signal; the limiter is a tanh
 * curve that rounds the peaks off instead of letting them clip hard. Boosted
 * sounds come out louder and a little fuzzy, which is the point: it is for a
 * device someone has turned down low.
 */

import {
  DEFAULT_SOUND,
  isSoundId,
  VOLUME_DEFAULT,
  VOLUME_MAX,
  VOLUME_MIN,
  type SoundId,
} from "./remote-sound";

type Voice = {
  ctx: BaseAudioContext;
  out: AudioNode;
  /** When the effect starts, in the context's clock. */
  at: number;
  /** Two seconds of white noise, made once per context. */
  noise: () => AudioBuffer;
};

/** A value to reach `time` seconds after the start. The first is where it begins. */
type Ramp = readonly [time: number, value: number];

type Effect = (voice: Voice) => number;

type Envelope = {
  /** Seconds after the effect's start. */
  start?: number;
  peak?: number;
  attack?: number;
  hold?: number;
  release: number;
};

type Filter = { type: BiquadFilterType; freq: number | Ramp[]; q?: number };

function ramps(
  param: AudioParam,
  at: number,
  value: number | Ramp[],
  exponential = true,
) {
  if (typeof value === "number") {
    param.setValueAtTime(value, at);
    return;
  }
  const [first, ...rest] = value;
  param.setValueAtTime(first[1], at + first[0]);
  for (const [time, target] of rest) {
    if (exponential)
      param.exponentialRampToValueAtTime(Math.max(target, 1), at + time);
    else param.linearRampToValueAtTime(target, at + time);
  }
}

/** Attack to the peak, hold there, then fall away to silence. */
function envelope(gain: GainNode, at: number, shape: Envelope) {
  const attack = shape.attack ?? 0.01;
  const hold = shape.hold ?? 0;
  const peak = shape.peak ?? 0.3;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + attack);
  if (hold > 0) gain.gain.setValueAtTime(peak, at + attack + hold);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    at + attack + hold + shape.release,
  );
  return attack + hold + shape.release;
}

function filtered(
  voice: Voice,
  at: number,
  source: AudioNode,
  filter?: Filter,
) {
  if (!filter) return source;
  const node = voice.ctx.createBiquadFilter();
  node.type = filter.type;
  ramps(node.frequency, at, filter.freq);
  node.Q.value = filter.q ?? 1;
  source.connect(node);
  return node;
}

/** A slow oscillator wired into a parameter: vibrato on a pitch, wobble on a gain. */
function modulate(
  voice: Voice,
  target: AudioParam,
  rate: number,
  depth: number,
  at: number,
  until: number,
  type: OscillatorType = "sine",
) {
  const lfo = voice.ctx.createOscillator();
  lfo.type = type;
  lfo.frequency.value = rate;
  const amount = voice.ctx.createGain();
  amount.gain.value = depth;
  lfo.connect(amount).connect(target);
  lfo.start(at);
  lfo.stop(until);
}

function tone(
  voice: Voice,
  spec: Envelope & {
    type: OscillatorType;
    freq: number | Ramp[];
    filter?: Filter;
    vibrato?: { rate: number; depth: number; type?: OscillatorType };
    /** Amplitude wobble, as a fraction of the level. */
    tremolo?: { rate: number; depth: number };
  },
) {
  const { ctx } = voice;
  const at = voice.at + (spec.start ?? 0);
  const osc = ctx.createOscillator();
  osc.type = spec.type;
  ramps(osc.frequency, at, spec.freq);
  const gain = ctx.createGain();
  const length = envelope(gain, at, spec);
  const until = at + length + 0.05;
  let node: AudioNode = filtered(voice, at, osc, spec.filter);
  node.connect(gain);
  node = gain;
  if (spec.tremolo) {
    const wobble = ctx.createGain();
    wobble.gain.value = 1 - spec.tremolo.depth;
    modulate(
      voice,
      wobble.gain,
      spec.tremolo.rate,
      spec.tremolo.depth,
      at,
      until,
    );
    node.connect(wobble);
    node = wobble;
  }
  node.connect(voice.out);
  if (spec.vibrato) {
    modulate(
      voice,
      osc.frequency,
      spec.vibrato.rate,
      spec.vibrato.depth,
      at,
      until,
      spec.vibrato.type,
    );
  }
  osc.start(at);
  osc.stop(until);
  return (spec.start ?? 0) + length;
}

function noise(voice: Voice, spec: Envelope & { filter?: Filter }) {
  const { ctx } = voice;
  const at = voice.at + (spec.start ?? 0);
  const source = ctx.createBufferSource();
  source.buffer = voice.noise();
  source.loop = true;
  const gain = ctx.createGain();
  const length = envelope(gain, at, spec);
  filtered(voice, at, source, spec.filter).connect(gain).connect(voice.out);
  source.start(at);
  source.stop(at + length + 0.05);
  return (spec.start ?? 0) + length;
}

/** The longest of several layers, which is when the effect is over. */
const longest = (...lengths: number[]) => Math.max(...lengths);

/**
 * The sawtooth-with-a-wobble every fart is built from. The pitch flutters at
 * `flutter` hertz and sags from `from` to `to`; the noise underneath is the air.
 */
function fart(
  voice: Voice,
  spec: {
    start?: number;
    from: number;
    to: number;
    length: number;
    flutter?: number;
    wet?: number;
    peak?: number;
  },
) {
  const start = spec.start ?? 0;
  const flutter = spec.flutter ?? 28;
  const peak = spec.peak ?? 0.5;
  return longest(
    tone(voice, {
      type: "sawtooth",
      start,
      freq: [
        [0, spec.from],
        [spec.length, spec.to],
      ],
      filter: { type: "lowpass", freq: 700, q: 4 },
      vibrato: { rate: flutter, depth: spec.from * 0.35, type: "triangle" },
      tremolo: { rate: flutter * 0.6, depth: 0.45 },
      peak,
      attack: 0.03,
      hold: spec.length * 0.7,
      release: spec.length * 0.3,
    }),
    noise(voice, {
      start,
      peak: peak * (spec.wet ?? 0.25),
      attack: 0.03,
      hold: spec.length * 0.6,
      release: spec.length * 0.4,
      filter: { type: "bandpass", freq: 420, q: 1.2 },
    }),
  );
}

const thump = (voice: Voice, start: number, peak = 0.9) =>
  tone(voice, {
    type: "sine",
    start,
    freq: [
      [0, 70],
      [0.18, 38],
    ],
    peak,
    attack: 0.005,
    release: 0.25,
  });

const EFFECTS = {
  // Classics
  beep: (v) =>
    tone(v, { type: "sine", freq: 880, peak: 0.3, hold: 0.3, release: 0.2 }),
  ding: (v) =>
    longest(
      tone(v, { type: "sine", freq: 1319, peak: 0.4, release: 1.5 }),
      tone(v, { type: "sine", freq: 2637, peak: 0.1, release: 0.5 }),
    ),
  doorbell: (v) =>
    longest(
      tone(v, { type: "sine", freq: 659, peak: 0.35, release: 0.7 }),
      tone(v, { type: "sine", freq: 1318, peak: 0.08, release: 0.4 }),
      tone(v, {
        type: "sine",
        start: 0.45,
        freq: 523,
        peak: 0.35,
        release: 1.2,
      }),
      tone(v, {
        type: "sine",
        start: 0.45,
        freq: 1046,
        peak: 0.08,
        release: 0.6,
      }),
    ),
  buzzer: (v) =>
    longest(
      tone(v, {
        type: "square",
        freq: 110,
        filter: { type: "lowpass", freq: 900 },
        peak: 0.25,
        hold: 0.6,
        release: 0.05,
      }),
      tone(v, {
        type: "sawtooth",
        freq: 113,
        filter: { type: "lowpass", freq: 900 },
        peak: 0.25,
        hold: 0.6,
        release: 0.05,
      }),
    ),
  alarm: (v) =>
    longest(
      ...[0, 0.24, 0.48, 0.72].map((start) =>
        tone(v, {
          type: "square",
          start,
          freq: 1000,
          filter: { type: "lowpass", freq: 3000 },
          peak: 0.2,
          hold: 0.1,
          release: 0.03,
        }),
      ),
    ),
  error: (v) =>
    longest(
      tone(v, {
        type: "triangle",
        freq: 660,
        peak: 0.3,
        hold: 0.12,
        release: 0.05,
      }),
      tone(v, {
        type: "triangle",
        start: 0.18,
        freq: 494,
        peak: 0.3,
        hold: 0.2,
        release: 0.1,
      }),
    ),
  honk: (v) =>
    longest(
      ...[233, 293].map((freq) =>
        tone(v, {
          type: "square",
          freq,
          filter: { type: "lowpass", freq: 1200 },
          peak: 0.22,
          attack: 0.02,
          hold: 0.5,
          release: 0.08,
        }),
      ),
    ),
  airhorn: (v) =>
    longest(
      ...[415, 418, 830, 622].map((freq, index) =>
        tone(v, {
          type: "sawtooth",
          freq: [
            [0, freq * 0.92],
            [0.15, freq],
          ],
          filter: { type: "lowpass", freq: 2500 },
          peak: index < 2 ? 0.22 : 0.08,
          attack: 0.03,
          hold: 1.2,
          release: 0.15,
        }),
      ),
    ),
  siren: (v) =>
    tone(v, {
      type: "sine",
      freq: [
        [0, 600],
        [0.6, 1000],
        [1.2, 600],
        [1.8, 1000],
        [2.4, 600],
      ],
      peak: 0.3,
      attack: 0.05,
      hold: 2.3,
      release: 0.15,
    }),

  // Farts and burps
  fart: (v) => fart(v, { from: 95, to: 62, length: 0.7 }),
  "fart-long": (v) => fart(v, { from: 85, to: 48, length: 1.9, flutter: 24 }),
  "fart-squeaky": (v) =>
    fart(v, { from: 240, to: 190, length: 0.5, flutter: 42, wet: 0.1 }),
  "fart-wet": (v) =>
    fart(v, { from: 80, to: 55, length: 1.1, flutter: 19, wet: 0.7 }),
  "fart-machine-gun": (v) =>
    longest(
      ...[0, 0.16, 0.32, 0.48, 0.64, 0.8].map((start, index) =>
        fart(v, {
          start,
          from: 110 - index * 6,
          to: 80 - index * 6,
          length: 0.11,
          flutter: 36,
        }),
      ),
    ),
  burp: (v) =>
    longest(
      tone(v, {
        type: "sawtooth",
        freq: [
          [0, 100],
          [0.55, 55],
        ],
        filter: { type: "lowpass", freq: 600, q: 5 },
        vibrato: { rate: 34, depth: 30, type: "square" },
        peak: 0.5,
        attack: 0.04,
        hold: 0.35,
        release: 0.2,
      }),
      noise(v, {
        peak: 0.12,
        attack: 0.04,
        hold: 0.3,
        release: 0.2,
        filter: { type: "bandpass", freq: 300, q: 1 },
      }),
    ),

  // Booms
  boom: (v) =>
    longest(
      tone(v, {
        type: "sine",
        freq: [
          [0, 150],
          [1, 32],
        ],
        peak: 0.9,
        attack: 0.005,
        release: 1.2,
      }),
      noise(v, {
        peak: 0.6,
        attack: 0.005,
        release: 0.8,
        filter: {
          type: "lowpass",
          freq: [
            [0, 400],
            [0.8, 60],
          ],
        },
      }),
    ),
  explosion: (v) =>
    longest(
      noise(v, {
        peak: 0.9,
        attack: 0.005,
        release: 1.7,
        filter: {
          type: "lowpass",
          freq: [
            [0, 6000],
            [1.6, 80],
          ],
        },
      }),
      tone(v, {
        type: "sine",
        freq: [
          [0, 90],
          [0.9, 30],
        ],
        peak: 0.7,
        attack: 0.01,
        release: 1,
      }),
    ),
  "bomb-drop": (v) =>
    longest(
      tone(v, {
        type: "sine",
        freq: [
          [0, 1400],
          [1.4, 220],
        ],
        peak: 0.25,
        attack: 0.05,
        hold: 1.3,
        release: 0.1,
      }),
      tone(v, {
        type: "sine",
        start: 1.45,
        freq: [
          [0, 140],
          [0.9, 30],
        ],
        peak: 0.9,
        attack: 0.005,
        release: 1.1,
      }),
      noise(v, {
        start: 1.45,
        peak: 0.6,
        attack: 0.005,
        release: 0.9,
        filter: {
          type: "lowpass",
          freq: [
            [0, 3000],
            [0.8, 80],
          ],
        },
      }),
    ),
  thunder: (v) =>
    longest(
      noise(v, {
        peak: 1.6,
        attack: 0.08,
        hold: 0.3,
        release: 1.2,
        filter: {
          type: "lowpass",
          freq: [
            [0, 350],
            [1.4, 90],
          ],
        },
      }),
      noise(v, {
        start: 0.9,
        peak: 1.2,
        attack: 0.3,
        hold: 0.4,
        release: 1.4,
        filter: { type: "lowpass", freq: 180 },
      }),
    ),
  gong: (v) =>
    longest(
      noise(v, {
        peak: 0.3,
        attack: 0.005,
        release: 0.15,
        filter: { type: "bandpass", freq: 900, q: 0.7 },
      }),
      ...[110, 166, 247, 331, 494, 742].map((freq, index) =>
        tone(v, {
          type: "sine",
          freq: freq * 1.003,
          peak: 0.28 / (index + 1),
          attack: 0.01,
          release: 3.6 - index * 0.3,
        }),
      ),
    ),
  "drum-roll": (v) =>
    longest(
      ...Array.from({ length: 26 }, (_, index) =>
        noise(v, {
          start: index * 0.058,
          peak: 0.45 + index * 0.03,
          attack: 0.003,
          release: 0.05,
          filter: { type: "bandpass", freq: 320, q: 0.6 },
        }),
      ),
    ),
  rimshot: (v) =>
    longest(
      ...[0, 0.22].map((start) =>
        tone(v, {
          type: "sine",
          start,
          freq: [
            [0, 240],
            [0.12, 95],
          ],
          peak: 0.6,
          attack: 0.003,
          release: 0.16,
        }),
      ),
      ...[0, 0.22].map((start) =>
        noise(v, {
          start,
          peak: 0.3,
          attack: 0.003,
          release: 0.05,
          filter: { type: "highpass", freq: 1500 },
        }),
      ),
      noise(v, {
        start: 0.46,
        peak: 0.45,
        attack: 0.005,
        release: 1.1,
        filter: { type: "highpass", freq: 5000 },
      }),
    ),

  // Cartoon
  boing: (v) =>
    tone(v, {
      type: "triangle",
      freq: [
        [0, 520],
        [0.5, 110],
      ],
      vibrato: { rate: 14, depth: 45 },
      peak: 0.45,
      attack: 0.005,
      release: 0.65,
    }),
  "slide-up": (v) =>
    tone(v, {
      type: "sine",
      freq: [
        [0, 400],
        [0.8, 1700],
      ],
      peak: 0.3,
      attack: 0.03,
      hold: 0.75,
      release: 0.1,
    }),
  "slide-down": (v) =>
    tone(v, {
      type: "sine",
      freq: [
        [0, 1700],
        [0.8, 380],
      ],
      peak: 0.3,
      attack: 0.03,
      hold: 0.75,
      release: 0.1,
    }),
  "sad-trombone": (v) =>
    longest(
      ...(
        [
          [0, 466, 440, 0.4],
          [0.45, 440, 415, 0.4],
          [0.9, 415, 392, 0.4],
          [1.35, 392, 349, 1],
        ] as const
      ).map(([start, from, to, length]) =>
        tone(v, {
          type: "sawtooth",
          start,
          freq: [
            [0, from],
            [length, to],
          ],
          filter: { type: "lowpass", freq: 1100, q: 2 },
          vibrato: length > 0.5 ? { rate: 5, depth: 6 } : undefined,
          peak: 0.3,
          attack: 0.04,
          hold: length * 0.8,
          release: length * 0.25,
        }),
      ),
    ),
  quack: (v) =>
    longest(
      ...[0, 0.26].map((start) =>
        tone(v, {
          type: "sawtooth",
          start,
          freq: [
            [0, 380],
            [0.18, 290],
          ],
          filter: { type: "bandpass", freq: 900, q: 4 },
          peak: 1.4,
          attack: 0.015,
          hold: 0.1,
          release: 0.1,
        }),
      ),
    ),
  bubble: (v) =>
    tone(v, {
      type: "sine",
      freq: [
        [0, 480],
        [0.09, 1500],
      ],
      peak: 0.5,
      attack: 0.005,
      release: 0.1,
    }),
  whistle: (v) =>
    tone(v, {
      type: "sine",
      freq: [
        [0, 1500],
        [0.3, 2300],
        [1, 1250],
      ],
      vibrato: { rate: 7, depth: 25 },
      peak: 0.3,
      attack: 0.03,
      hold: 0.9,
      release: 0.1,
    }),
  "wolf-whistle": (v) =>
    longest(
      tone(v, {
        type: "sine",
        freq: [
          [0, 900],
          [0.45, 2300],
        ],
        peak: 0.3,
        attack: 0.03,
        hold: 0.4,
        release: 0.05,
      }),
      tone(v, {
        type: "sine",
        start: 0.58,
        freq: [
          [0, 2300],
          [0.25, 1500],
          [0.7, 800],
        ],
        peak: 0.3,
        attack: 0.03,
        hold: 0.6,
        release: 0.12,
      }),
    ),
  "record-scratch": (v) =>
    noise(v, {
      peak: 1.3,
      attack: 0.01,
      hold: 0.3,
      release: 0.08,
      filter: {
        type: "bandpass",
        freq: [
          [0, 700],
          [0.18, 3800],
          [0.4, 500],
        ],
        q: 6,
      },
    }),
  glass: (v) =>
    longest(
      ...[0, 0.05, 0.11, 0.19, 0.26, 0.36, 0.48].map((start, index) =>
        noise(v, {
          start,
          peak: index === 0 ? 0.6 : 0.3 / (index + 1) + 0.05,
          attack: 0.003,
          release: index === 0 ? 0.2 : 0.09,
          filter: { type: "highpass", freq: 3200 + index * 400, q: 2 },
        }),
      ),
    ),
  cash: (v) =>
    longest(
      noise(v, {
        peak: 0.3,
        attack: 0.003,
        release: 0.08,
        filter: { type: "bandpass", freq: 3000, q: 1 },
      }),
      tone(v, {
        type: "sine",
        start: 0.1,
        freq: 2100,
        peak: 0.3,
        release: 0.9,
      }),
      tone(v, {
        type: "sine",
        start: 0.1,
        freq: 2640,
        peak: 0.25,
        release: 0.8,
      }),
    ),

  // Arcade
  laser: (v) =>
    tone(v, {
      type: "square",
      freq: [
        [0, 1800],
        [0.35, 140],
      ],
      filter: { type: "lowpass", freq: 4000 },
      peak: 0.25,
      attack: 0.005,
      hold: 0.25,
      release: 0.1,
    }),
  coin: (v) =>
    longest(
      tone(v, {
        type: "square",
        freq: 988,
        filter: { type: "lowpass", freq: 4000 },
        peak: 0.2,
        attack: 0.005,
        hold: 0.07,
        release: 0.01,
      }),
      tone(v, {
        type: "square",
        start: 0.08,
        freq: 1319,
        filter: { type: "lowpass", freq: 4000 },
        peak: 0.2,
        attack: 0.005,
        hold: 0.25,
        release: 0.2,
      }),
    ),
  "power-up": (v) =>
    longest(
      ...[262, 330, 392, 523, 659, 784, 1047].map((freq, index, all) =>
        tone(v, {
          type: "square",
          start: index * 0.07,
          freq,
          filter: { type: "lowpass", freq: 4500 },
          peak: 0.18,
          attack: 0.005,
          hold: index === all.length - 1 ? 0.25 : 0.055,
          release: index === all.length - 1 ? 0.3 : 0.01,
        }),
      ),
    ),
  tada: (v) =>
    longest(
      ...[523, 659, 784].map((freq) =>
        tone(v, {
          type: "triangle",
          freq,
          peak: 0.2,
          attack: 0.01,
          hold: 0.2,
          release: 0.05,
        }),
      ),
      ...[659, 784, 1047, 1319].map((freq) =>
        tone(v, {
          type: "triangle",
          start: 0.28,
          freq,
          peak: 0.18,
          attack: 0.02,
          hold: 0.5,
          release: 0.5,
        }),
      ),
    ),
  fanfare: (v) =>
    longest(
      ...(
        [
          [0, 392, 0.13],
          [0.17, 392, 0.13],
          [0.34, 392, 0.13],
          [0.51, 523, 0.7],
        ] as const
      ).map(([start, freq, hold]) =>
        tone(v, {
          type: "square",
          start,
          freq,
          filter: { type: "lowpass", freq: 2200 },
          peak: 0.2,
          attack: 0.01,
          hold,
          release: hold > 0.5 ? 0.3 : 0.02,
        }),
      ),
    ),
  ufo: (v) =>
    tone(v, {
      type: "sine",
      freq: [
        [0, 500],
        [1.8, 1100],
      ],
      vibrato: { rate: 9, depth: 260 },
      peak: 0.25,
      attack: 0.1,
      hold: 1.6,
      release: 0.3,
    }),

  // Annoying
  cricket: (v) =>
    longest(
      ...Array.from({ length: 5 }, (_, chirp) =>
        longest(
          ...[0, 0.022, 0.044].map((pulse) =>
            tone(v, {
              type: "sine",
              start: chirp * 0.19 + pulse,
              freq: 4400,
              peak: 0.2,
              attack: 0.003,
              hold: 0.008,
              release: 0.008,
            }),
          ),
        ),
      ),
    ),
  mosquito: (v) =>
    tone(v, {
      type: "sawtooth",
      freq: [
        [0, 640],
        [1.2, 700],
        [2.5, 600],
      ],
      filter: { type: "lowpass", freq: 2500 },
      vibrato: { rate: 6, depth: 35 },
      tremolo: { rate: 3, depth: 0.5 },
      peak: 0.12,
      attack: 0.3,
      hold: 2,
      release: 0.3,
    }),
  heartbeat: (v) =>
    longest(
      thump(v, 0),
      thump(v, 0.28, 0.7),
      thump(v, 0.95),
      thump(v, 1.23, 0.7),
    ),
  spooky: (v) =>
    longest(
      tone(v, {
        type: "sine",
        freq: [
          [0, 330],
          [2.2, 180],
        ],
        vibrato: { rate: 4.5, depth: 18 },
        peak: 0.3,
        attack: 0.4,
        hold: 1.4,
        release: 0.5,
      }),
      tone(v, {
        type: "sine",
        freq: [
          [0, 495],
          [2.2, 270],
        ],
        vibrato: { rate: 4.5, depth: 27 },
        peak: 0.12,
        attack: 0.4,
        hold: 1.4,
        release: 0.5,
      }),
    ),
} satisfies Record<SoundId, Effect>;

/** A tanh curve: linear-ish for quiet signals, rounding off anything hot. */
function softClipCurve(): Float32Array<ArrayBuffer> {
  const samples = 1024;
  const curve = new Float32Array(samples);
  for (let index = 0; index < samples; index++) {
    const x = (index * 2) / (samples - 1) - 1;
    curve[index] = Math.tanh(x * 1.5);
  }
  return curve;
}

function whiteNoise(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index++)
    data[index] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * Schedules one sound from the catalogue on `ctx`, at `volume` percent, and
 * returns how many seconds it runs. An id the catalogue does not know plays
 * the default: the row may be older than the picker, or newer than this
 * build. Separate from `playSoundEffect` so it can be rendered offline —
 * which is how the catalogue is checked without anyone listening.
 */
export function scheduleSoundEffect(
  ctx: BaseAudioContext,
  id: string,
  volume = VOLUME_DEFAULT,
): number {
  const effect: Effect = EFFECTS[isSoundId(id) ? id : DEFAULT_SOUND];
  const master = ctx.createGain();
  master.gain.value = Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, volume)) / 100;
  const limiter = ctx.createWaveShaper();
  limiter.curve = softClipCurve();
  // No oversampling: its resampling filter overshoots on noise bursts, and
  // the curve is smooth enough that aliasing is not worth that.
  limiter.oversample = "none";
  master.connect(limiter).connect(ctx.destination);
  let buffer: AudioBuffer | undefined;
  return effect({
    ctx,
    out: master,
    at: ctx.currentTime + 0.02,
    noise: () => (buffer ??= whiteNoise(ctx)),
  });
}

/**
 * Plays one sound from the catalogue at `volume` percent, on a context made
 * for it and closed once it is quiet.
 *
 * A context made outside a click starts suspended in some browsers. The page
 * has almost always been clicked by now, which lets `resume` succeed; where
 * it cannot, the sound is silently lost rather than thrown.
 */
export function playSoundEffect(id: string, volume = VOLUME_DEFAULT): void {
  try {
    const ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const seconds = scheduleSoundEffect(ctx, id, volume);
    setTimeout(() => void ctx.close().catch(() => {}), (seconds + 0.6) * 1000);
  } catch {
    // No audio here. Nothing else to show: the sound is the whole feature.
  }
}
