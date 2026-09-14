import { describe, expect, test } from "vitest";
import { isContentHash, sha256Hex } from "@/lib/simulator/content-hash";

const EMPTY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const ABC_SHA256 =
  "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

describe("isContentHash", () => {
  test.each([
    [EMPTY_SHA256, true],
    ["0".repeat(64), true],
    ["f".repeat(64), true],
    [EMPTY_SHA256.toUpperCase(), false],
    ["a".repeat(63), false],
    ["a".repeat(65), false],
    ["", false],
    ["g".repeat(64), false],
    [`${"a".repeat(63)} `, false],
    [`${"a".repeat(64)}\n`, false],
  ])("%j -> %s", (value, expected) => {
    expect(isContentHash(value)).toBe(expected);
  });
});

describe("sha256Hex", () => {
  test.each([
    ["", EMPTY_SHA256],
    ["abc", ABC_SHA256],
  ])("hashes %j to the well-known digest", async (text, digest) => {
    const bytes = new TextEncoder().encode(text);
    const hash = await sha256Hex(bytes.buffer as ArrayBuffer);
    expect(hash).toBe(digest);
    expect(isContentHash(hash)).toBe(true);
  });

  test("pads single-digit bytes so every digest is sixty-four characters", async () => {
    const hash = await sha256Hex(new ArrayBuffer(0));
    expect(hash).toHaveLength(64);
    expect(hash.startsWith("e3b0c442")).toBe(true);
  });
});
