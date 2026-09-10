// Offline renderer. Uses @napi-rs/canvas (or PHILOSOPHY_CANVAS_MODULE) and FFmpeg.
// No render dependency is shipped to the browser.
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const modulePath = process.env.PHILOSOPHY_CANVAS_MODULE;
const canvasModule = await import(
  modulePath
    ? pathToFileURL(path.join(modulePath, "index.js")).href
    : "@napi-rs/canvas"
);
const { createCanvas, loadImage } = canvasModule.default ?? canvasModule;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "public/video/philosophy");
const FLAT_THEME = process.argv
  .find((arg) => arg.startsWith("--background="))
  ?.split("=")[1];
if (FLAT_THEME && !["light", "dark"].includes(FLAT_THEME))
  throw new Error("Background must be light or dark");
const SMOOTH = Boolean(FLAT_THEME) || process.argv.includes("--hevc-smooth");
const FPS = SMOOTH ? 60 : 30;
const DURATION = 12;
const FINGERS = [
  [50, 548],
  [210, 591],
  [350, 634],
  [523, 526],
  [656, 451],
  [885, 549],
  [1046, 702],
  [1240, 724],
  [1345, 680],
  [1453, 642],
];

async function render(compact, hands, phone) {
  const width = SMOOTH ? (compact ? 1300 : 2000) : compact ? 960 : 1440;
  const height = SMOOTH ? 940 : compact ? 694 : 678;
  const worldWidth = compact ? 650 : 1000;
  const handWidth = compact ? 215 : 330;
  const scale = width / worldWidth;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const name = `${compact ? "puppets-mobile" : "puppets"}${FLAT_THEME ? `-${FLAT_THEME}` : SMOOTH ? "-smooth" : ""}`;
  const encoder = spawn(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "rawvideo",
      "-pixel_format",
      "rgba",
      "-video_size",
      `${width}x${height}`,
      "-framerate",
      String(FPS),
      "-i",
      "pipe:0",
      ...(!SMOOTH
        ? [
            "-map",
            "0:v",
            "-an",
            "-c:v",
            "libvpx-vp9",
            "-pix_fmt",
            "yuva420p",
            "-crf",
            "28",
            "-b:v",
            "0",
            "-row-mt",
            "1",
            "-threads",
            "4",
            "-cpu-used",
            "3",
            "-auto-alt-ref",
            "0",
            "-metadata:s:v:0",
            "alpha_mode=1",
            path.join(OUTPUT, `${name}.webm`),
          ]
        : []),
      ...(FLAT_THEME
        ? [
            "-map",
            "0:v",
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-threads",
            "4",
            "-crf",
            "17",
            "-pix_fmt",
            "yuv420p",
            "-g",
            "120",
            "-movflags",
            "+faststart",
            path.join(OUTPUT, `${name}.mp4`),
          ]
        : [
            "-map",
            "0:v",
            "-an",
            "-c:v",
            "hevc_videotoolbox",
            "-pix_fmt",
            "bgra",
            "-alpha_quality",
            "0.85",
            "-allow_sw",
            "1",
            "-b:v",
            SMOOTH ? "14000k" : "4000k",
            "-tag:v",
            "hvc1",
            "-movflags",
            "+faststart",
            path.join(OUTPUT, `${name}.mov`),
          ]),
    ],
    { stdio: ["pipe", "ignore", "inherit"] },
  );
  const finished = once(encoder, "exit");
  encoder.stdin.on("error", () => {});

  for (let frame = 0; frame < DURATION * FPS; frame++) {
    const phase = (frame / (DURATION * FPS)) * Math.PI * 2;
    ctx.clearRect(0, 0, width, height);
    if (FLAT_THEME) {
      ctx.fillStyle = FLAT_THEME === "dark" ? "#171717" : "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }
    ctx.save();
    ctx.scale(scale, scale);
    const imageScale = handWidth / 768;
    const margin = compact ? 40 : 30;
    const handX = [margin, worldWidth - handWidth - margin];
    const handY = [0, 1].map(
      (side) => (compact ? -40 : -80) + Math.sin(phase + side * 1.7) * 15,
    );

    FINGERS.forEach(([fx, fy], i) => {
      const side = i < 5 ? 0 : 1;
      const anchorX = handX[side] + (fx - side * 768) * imageScale;
      const anchorY = handY[side] + fy * imageScale;
      const length = 83 + (i % 5) * 11 + Math.sin(i * 4) * 13;
      // Steady-state solution of a damped, driven pendulum. Integer-period
      // forcing closes both position and velocity exactly at the loop seam.
      const frequency = (3 * 2 * Math.PI) / DURATION;
      const stiffness = 700 / length;
      const damping = 0.65;
      const lag = Math.atan2(
        damping * frequency,
        stiffness - frequency * frequency,
      );
      const amplitude = Math.min(
        0.23,
        0.85 /
          Math.hypot(stiffness - frequency * frequency, damping * frequency),
      );
      const angle =
        amplitude * Math.sin(phase * 3 + i * 2.7 - lag) +
        0.035 * Math.sin(phase * 2 + i);
      const stretch = 3.2 * Math.sin(phase * 3 + i - 0.5);
      const x = anchorX + Math.sin(angle) * length;
      const y = anchorY + Math.cos(angle) * (length + stretch);
      ctx.strokeStyle = "rgba(119,119,119,0.8)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(anchorX, anchorY - 4);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-angle * 0.7);
      const phoneHeight = compact ? 89 : 100;
      ctx.drawImage(
        phone,
        330,
        0,
        600,
        1254,
        -phoneHeight * 0.24,
        0,
        phoneHeight * 0.48,
        phoneHeight,
      );
      ctx.restore();
    });
    for (let side = 0; side < 2; side++) {
      ctx.drawImage(
        hands,
        side * 768,
        0,
        768,
        1024,
        handX[side],
        handY[side],
        handWidth,
        1024 * imageScale,
      );
    }
    ctx.restore();
    if (frame === 0 && !FLAT_THEME)
      await fs.writeFile(
        path.join(OUTPUT, `${name}-poster.png`),
        canvas.encodeSync("png"),
      );
    const pixels = ctx.getImageData(0, 0, width, height).data;
    if (
      !encoder.stdin.write(
        Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength),
      )
    )
      await once(encoder.stdin, "drain");
    if (frame % 90 === 0)
      console.log(`${name}: ${frame}/${DURATION * FPS} frames`);
  }
  encoder.stdin.end();
  const [code] = await finished;
  if (code !== 0) throw new Error(`FFmpeg exited ${code}`);
  console.log(
    `${name}: exported transparent ${SMOOTH ? "HEVC" : "WebM + HEVC"}, ${width}x${height}, ${FPS}fps, ${DURATION}s`,
  );
}

(async () => {
  await fs.mkdir(OUTPUT, { recursive: true });
  const [hands, phone] = await Promise.all([
    loadImage(path.join(ROOT, "public/images/6eb34ee789e68827.png")),
    loadImage(path.join(ROOT, "public/images/8780df12a3142aeb.png")),
  ]);
  await render(false, hands, phone);
  await render(true, hands, phone);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
