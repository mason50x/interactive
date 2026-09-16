/**
 * Edit the native Chromium screen recording: crop window shadows, trim pauses,
 * and keep the full browser view visible. The pointer and click highlights
 * are captured by macOS, not a recreated browser UI.
 *
 * Usage: node scripts/prepare-entertainment-demo.mjs /path/to/recording.mov
 * Recording: 1200×905 Chromium window, macOS screencapture -v -l<window-id> -k.
 * Timing/crop below match the September 16, 2026 recording; adjust for a retake.
 */
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = process.argv[2];
if (!source) throw new Error("Pass the native screen recording path.");
const output = fileURLToPath(
  new URL("../public/entertainment-setup/", import.meta.url),
);
const filter = [
  "fps=30",
  "crop=2400:1810:112:76",
  "scale=1280:966",
  "setsar=1",
].join(",");
execFileSync(
  "ffmpeg",
  [
    "-y",
    "-ss",
    "4",
    "-i",
    source,
    "-t",
    "25",
    "-vf",
    filter,
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-an",
    output + "enable-cookies.mp4",
  ],
  { stdio: "pipe" },
);
execFileSync(
  "ffmpeg",
  [
    "-y",
    "-i",
    output + "enable-cookies.mp4",
    "-frames:v",
    "1",
    "-q:v",
    "2",
    output + "enable-cookies-poster.jpg",
  ],
  { stdio: "pipe" },
);
await writeFile(
  output + "enable-cookies.vtt",
  `WEBVTT

00:00:00.000 --> 00:00:03.000
In Chrome Settings → Privacy and security, click Third-party cookies.

00:00:03.000 --> 00:00:08.000
Under “Sites allowed to use third-party cookies”, click Add.

00:00:08.000 --> 00:00:17.700
Enter this website’s address from your browser, then click Add.

00:00:17.700 --> 00:00:25.000
The site is saved. Return to Entertainment and confirm.
`,
);
console.log(
  "Prepared 25-second native browser demo with cursor, clicks, full browser framing, and captions.",
);
