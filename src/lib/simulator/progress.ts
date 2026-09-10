/**
 * What a save is, and what makes one valid.
 *
 * A checkpoint is the emulator's state blob at one frame plus the cartridge
 * RAM, tagged with the engine build that wrote it and the hash of the
 * program it belongs to. `validateProgress` refuses anything that does not
 * match all three, because loading a state into the wrong core or the wrong
 * program is not a corrupted game — it is a crash.
 */
import type { Progress, Mode } from "./types";
export const ENGINE_BUILD = "c60e138";
export const STATE_BYTES = 199608;
export function validateProgress(value: Progress, hash: string): Progress {
  if (value.contentHash !== hash)
    throw new Error("This progress belongs to a different file.");
  if (value.engineBuild !== ENGINE_BUILD || value.formatVersion !== 1)
    throw new Error(
      "This progress uses a different simulator version. Your backup has been preserved.",
    );
  if (
    !(value.checkpoint instanceof ArrayBuffer) ||
    value.checkpoint.byteLength !== STATE_BYTES ||
    new DataView(value.checkpoint).getUint32(0, true) !== 1800906722
  )
    throw new Error("This progress file is damaged.");
  if (
    value.battery &&
    (!(value.battery instanceof ArrayBuffer) ||
      ![0, 512, 2048, 8192, 32768, 65536, 131072].includes(
        value.battery.byteLength,
      ))
  )
    throw new Error("Invalid battery progress.");
  if (
    !Number.isFinite(value.capturedAt) ||
    value.capturedAt < 0 ||
    !["mono", "color"].includes(value.mode) ||
    !/^[-a-zA-Z0-9]{1,80}$/.test(value.captureId)
  )
    throw new Error("Invalid progress metadata.");
  return {
    contentHash: value.contentHash,
    engineBuild: value.engineBuild,
    formatVersion: value.formatVersion,
    mode: value.mode,
    captureId: value.captureId,
    capturedAt: value.capturedAt,
    checkpoint: value.checkpoint,
    ...(value.battery ? { battery: value.battery } : {}),
  };
}
export function makeProgress(
  contentHash: string,
  mode: Mode,
  data: { checkpoint: ArrayBuffer; battery?: ArrayBuffer },
): Progress {
  return validateProgress(
    {
      contentHash,
      mode,
      ...data,
      captureId: crypto.randomUUID(),
      engineBuild: ENGINE_BUILD,
      formatVersion: 1,
      capturedAt: Date.now(),
    },
    contentHash,
  );
}
const base64 = (buffer: ArrayBuffer) => {
  let s = "";
  for (const b of new Uint8Array(buffer)) s += String.fromCharCode(b);
  return btoa(s);
};
const decode = (s: string) =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;
export function exportProgress(progress: Progress) {
  validateProgress(progress, progress.contentHash);
  const body = JSON.stringify({
    ...progress,
    checkpoint: base64(progress.checkpoint),
    battery: progress.battery ? base64(progress.battery) : undefined,
  });
  const url = URL.createObjectURL(
    new Blob([body], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "learning-simulator.progress";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function importProgress(file: File, hash: string) {
  if (file.size > 750000) throw new Error("This progress file is too large.");
  try {
    const data = JSON.parse(await file.text());
    return validateProgress(
      {
        ...data,
        checkpoint: decode(data.checkpoint),
        battery: data.battery ? decode(data.battery) : undefined,
      },
      hash,
    );
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Invalid progress file.",
    );
  }
}
