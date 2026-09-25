/** Render the original onboarding cue. Requires ffmpeg with libmp3lame. */
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import cue from "../config/onboarding-cue.json" with { type: "json" };

const sampleRate = 44100;
// 128 BPM keeps every title change on a downbeat: see onboarding-experience.tsx.
const bpm = cue.bpm;
const beat = 60 / bpm;
const bars = cue.bars;
const seconds = bars * 4 * beat;
const size = Math.ceil(seconds * sampleRate);
const left = new Float32Array(size);
const right = new Float32Array(size);
const twopi = Math.PI * 2;
let seed = 43981;
const random = () =>
  ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const add = (index, sample, pan = 0) => {
  // The tail of the final bar wraps into the first, so the cue is a continuous loop.
  const wrapped = ((index % size) + size) % size;
  left[wrapped] += sample * Math.sqrt((1 - pan) / 2);
  right[wrapped] += sample * Math.sqrt((1 + pan) / 2);
};
const atBeat = (position) => Math.round(position * beat * sampleRate);

function kick(position, gain = 1) {
  const start = atBeat(position);
  const length = Math.round(0.48 * sampleRate);
  let phase = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    phase += (twopi * (43 + 155 * Math.exp(-t * 42))) / sampleRate;
    const envelope = Math.exp(-t * 9) * Math.min(1, t * 1200);
    const click = random() * Math.exp(-t * 180) * 0.045;
    add(
      start + i,
      (Math.tanh(Math.sin(phase) * 1.6) * envelope * 0.56 + click) * gain,
    );
  }
}

function clap(position, gain = 1) {
  const start = atBeat(position);
  const length = Math.round(0.24 * sampleRate);
  let previous = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const noise = random();
    const high = noise - previous * 0.89;
    previous = noise;
    const bursts =
      Math.exp(-t * 38) +
      0.65 * Math.exp(-Math.abs(t - 0.024) * 170) +
      0.35 * Math.exp(-Math.abs(t - 0.052) * 125);
    const body = Math.sin(twopi * 188 * t) * Math.exp(-t * 21);
    add(start + i, (high * bursts * 0.12 + body * 0.052) * gain, -0.05);
  }
}

function hat(position, gain = 1, pan = 0.15) {
  const start = atBeat(position);
  const length = Math.round(0.09 * sampleRate);
  let low = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const noise = random();
    low = low * 0.84 + noise * 0.16;
    add(start + i, (noise - low) * Math.exp(-t * 43) * gain * 0.105, pan);
  }
}

function bass(midi, position, duration, gain = 1) {
  const start = atBeat(position);
  const length = Math.round(duration * beat * sampleRate);
  const f = hz(midi);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const release = Math.min(1, (length - i) / (sampleRate * 0.08));
    const envelope = Math.min(1, t * 100) * Math.exp(-t * 1.8) * release;
    const wave =
      Math.sin(twopi * f * t) +
      0.52 * Math.sin(twopi * 2 * f * t) +
      0.18 * Math.sin(twopi * 3 * f * t);
    add(start + i, Math.tanh(wave * 2.5) * envelope * 0.24 * gain);
  }
}

function key(midi, position, duration, gain = 1, pan = 0) {
  const start = atBeat(position);
  const length = Math.round(duration * beat * sampleRate);
  const f = hz(midi);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const release = Math.min(1, (length - i) / (sampleRate * 0.12));
    const envelope =
      Math.min(1, t * 180) * (0.12 + 0.88 * Math.exp(-t * 5.2)) * release;
    const modulation = 2.4 * Math.exp(-t * 9) * Math.sin(twopi * f * 1.99 * t);
    const wave =
      Math.sin(twopi * f * t + modulation) +
      0.34 * Math.sin(twopi * f * 2.008 * t);
    add(start + i, wave * envelope * 0.075 * gain, pan);
  }
}

function pad(midi, position, duration, gain = 1, pan = 0) {
  const start = atBeat(position);
  const length = Math.round(duration * beat * sampleRate);
  const f = hz(midi);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const attack = Math.min(1, t / 0.22);
    const release = Math.min(1, (length - i) / (sampleRate * 0.5));
    const beatPhase = ((position * beat + t) % beat) / beat;
    const duck = 0.42 + 0.58 * Math.min(1, beatPhase / 0.34);
    const swell =
      attack * release * duck * (0.82 + 0.18 * Math.sin(twopi * 0.19 * t));
    const wave =
      Math.sin(twopi * f * t) +
      0.29 * Math.sin(twopi * f * 2.004 * t) +
      0.12 * Math.sin(twopi * f * 3.01 * t);
    add(start + i, wave * swell * 0.026 * gain, pan);
  }
}

function pluck(midi, position, gain = 1, pan = 0) {
  const start = atBeat(position);
  const length = Math.round(0.28 * sampleRate);
  const f = hz(midi);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const envelope = Math.min(1, t * 700) * Math.exp(-t * 16);
    const wave = Math.sin(
      twopi * f * t + 3.4 * Math.exp(-t * 26) * Math.sin(twopi * f * 2.5 * t),
    );
    add(start + i, wave * envelope * 0.095 * gain, pan);
  }
}

function impact(position, gain = 1) {
  const start = atBeat(position);
  const length = Math.round(0.48 * sampleRate);
  let low = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const white = random();
    low = low * 0.94 + white * 0.06;
    const noise = (white - low) * Math.exp(-t * 16) * 0.17;
    const tone =
      Math.sin(twopi * (59 * t + (22 * (1 - Math.exp(-t * 22))) / 22)) *
      Math.exp(-t * 8) *
      0.25;
    add(start + i, (noise + tone) * gain);
  }
}

// D minor with a tense A turnaround. The chords change at the story cuts.
const harmony = [
  { root: 38, chord: [50, 53, 57, 60], lead: [74, 77, 81, 84] }, // Dm7
  { root: 34, chord: [46, 50, 53, 57], lead: [70, 74, 77, 81] }, // Bbmaj7
  { root: 31, chord: [43, 46, 50, 53], lead: [67, 70, 74, 77] }, // Gm7
  { root: 33, chord: [45, 49, 52, 55], lead: [69, 73, 76, 79] }, // A7
];
const chordAtBar = [0, 0, 1, 1, 2, 2, 3, 3, 0, 0, 1, 1, 2, 2, 3, 3];
const sceneBars = new Set(cue.sceneBars);
for (let bar = 0; bar < bars; bar++) {
  const base = bar * 4;
  const chord = harmony[chordAtBar[bar]];
  const intensity = bar < 5 ? 0.88 : bar < 11 ? 1 : 0.92;
  if (sceneBars.has(bar)) impact(base, bar === 1 ? 1.4 : 0.7);
  for (let b = 0; b < 4; b++) {
    kick(base + b, intensity);
    hat(base + b + 0.5, 0.9 * intensity, b % 2 ? 0.45 : -0.45);
    if (b === 1 || b === 3) clap(base + b, intensity);
    if (bar >= 5) hat(base + b + 0.25, 0.28, -0.32);
  }
  if (bar === 4 || bar === 8 || bar === 10 || bar === 14)
    kick(base + 3.75, 0.55);
  bass(chord.root, base + 0.5, 0.48, 1.1 * intensity);
  bass(chord.root, base + 1.5, 0.39, 0.88 * intensity);
  bass(chord.root + 12, base + 2.5, 0.43, 0.79 * intensity);
  bass(chord.root, base + 3.25, 0.49, 0.93 * intensity);
  for (const [index, note] of chord.chord.entries()) {
    pad(note + 12, base, 3.9, 0.75 * intensity, index % 2 ? 0.46 : -0.46);
    key(note + 12, base + 0.5, 0.52, 0.6 * intensity, index % 2 ? 0.26 : -0.26);
    key(
      note + 12,
      base + 2.5,
      0.52,
      0.55 * intensity,
      index % 2 ? -0.25 : 0.25,
    );
  }
  for (const step of [1, 3, 4, 6]) {
    pluck(
      chord.chord[[0, 2, 1, 3, 2, 1, 3][step]] + 24,
      base + step * 0.5,
      intensity * 0.68,
      step % 2 ? 0.46 : -0.46,
    );
  }
  if (bar >= 3) {
    const phrase = bar % 2 === 0 ? [0, 2, 3, 1] : [2, 1, 0, 2];
    for (let j = 0; j < phrase.length; j++) {
      key(
        chord.lead[phrase[j]],
        base + [0.75, 1.5, 2.75, 3.5][j],
        0.36,
        bar >= 9 ? 0.92 : 0.62,
        j % 2 ? 0.47 : -0.47,
      );
    }
  }
}

// Circular stereo room and dotted-eighth echo preserve the reverb at the seam.
const delayA = Math.round(0.17 * sampleRate);
const delayB = Math.round(0.29 * sampleRate);
const dryLeft = left.slice();
const dryRight = right.slice();
for (let i = 0; i < size; i++) {
  left[i] += dryRight[(i - delayA + size) % size] * 0.09 + dryLeft[(i - delayB + size) % size] * 0.065;
  right[i] += dryLeft[(i - delayA + size) % size] * 0.09 + dryRight[(i - delayB + size) % size] * 0.065;
}
const pcm = Buffer.alloc(size * 4 + 44);
pcm.write("RIFF", 0);
pcm.writeUInt32LE(pcm.length - 8, 4);
pcm.write("WAVEfmt ", 8);
pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20);
pcm.writeUInt16LE(2, 22);
pcm.writeUInt32LE(sampleRate, 24);
pcm.writeUInt32LE(sampleRate * 4, 28);
pcm.writeUInt16LE(4, 32);
pcm.writeUInt16LE(16, 34);
pcm.write("data", 36);
pcm.writeUInt32LE(size * 4, 40);
for (let i = 0; i < size; i++) {
  pcm.writeInt16LE(
    Math.round(Math.tanh(left[i] * 1.25) * 28000),
    44 + i * 4,
  );
  pcm.writeInt16LE(
    Math.round(Math.tanh(right[i] * 1.25) * 28000),
    46 + i * 4,
  );
}
const wave = join(tmpdir(), `interactive-onboarding-${process.pid}.wav`);
writeFileSync(wave, pcm);
const result = spawnSync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    wave,
    "-codec:a",
    "libmp3lame",
    "-qscale:a",
    "3",
    "public/audio/onboarding.mp3",
  ],
  { stdio: "inherit" },
);
unlinkSync(wave);
if (result.status !== 0)
  throw new Error("ffmpeg failed to encode the soundtrack");
console.log(
  `Rendered original onboarding music: ${seconds.toFixed(1)} seconds`,
);
