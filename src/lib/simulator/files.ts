import type { Program } from "./types";
export async function identify(bytes: ArrayBuffer): Promise<Program> {
  const data = new Uint8Array(bytes);
  if (
    data.length < 32768 ||
    data.length > 8 * 1024 * 1024 ||
    data.length % 16384 !== 0
  )
    throw new Error("Select a supported file between 32 KB and 8 MB.");
  const supported = [
    0, 1, 2, 3, 5, 6, 8, 9, 15, 16, 17, 18, 19, 25, 26, 27, 28, 29, 30,
  ];
  if (!supported.includes(data[0x147]))
    throw new Error("This file uses an unsupported format.");
  let sum = 0;
  for (let i = 0x134; i <= 0x14c; i++) sum = (sum - data[i] - 1) & 255;
  if (sum !== data[0x14d])
    throw new Error("The file header is damaged or unsupported.");
  const declared = data[0x148];
  const expected =
    declared <= 8
      ? 32768 * 2 ** declared
      : (
          { 0x52: 72 * 16384, 0x53: 80 * 16384, 0x54: 96 * 16384 } as Record<
            number,
            number
          >
        )[declared];
  if (!expected || expected !== data.length)
    throw new Error("The file is incomplete or has an unsupported size.");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return {
    bytes,
    contentHash: Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join(""),
    mode: data[0x143] & 0x80 ? "color" : "mono",
  };
}
export async function openProgram(file: File) {
  if (!/\.(gb|gbc)$/i.test(file.name))
    throw new Error("Choose a .gb or .gbc file.");
  if (file.size > 8 * 1024 * 1024)
    throw new Error("The file is larger than 8 MB.");
  return identify(await file.arrayBuffer());
}
