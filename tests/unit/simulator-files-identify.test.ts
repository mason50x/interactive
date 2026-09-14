import { createTestProgram } from "../fixtures/simulator-fixture.mjs";
import { describe, expect, test } from "vitest";
import { sha256Hex } from "@/lib/simulator/content-hash";
import { identify } from "@/lib/simulator/files";

const KB = 1024;
const BANK = 16 * KB;

/** Recompute the header checksum over 0x134..0x14c after editing a header. */
function seal<T extends Uint8Array>(data: T): T {
  let sum = 0;
  for (let i = 0x134; i <= 0x14c; i++) sum = (sum - data[i] - 1) & 255;
  data[0x14d] = sum;
  return data;
}

const fixture = () => new Uint8Array(createTestProgram());

/** A valid header of a given declared size, in a buffer of `length` bytes. */
function program(length: number, edits: (data: Uint8Array) => void = () => {}) {
  const data = new Uint8Array(length);
  data.set(fixture().subarray(0x100, 0x150), 0x100);
  edits(data);
  return seal(data).buffer;
}

describe("identify rejects", () => {
  test.each([
    [100, "well under 32 KB"],
    [16 * KB, "a single bank"],
    [32 * KB + 1, "not a multiple of 16 KB"],
    [48 * KB - 1, "one byte short of three banks"],
    [8 * 1024 * KB + BANK, "over 8 MB"],
  ])("a buffer of %i bytes (%s)", async (length) => {
    await expect(identify(new ArrayBuffer(length))).rejects.toThrow("32 KB");
  });

  test.each([0x04, 0x07, 0x0a, 0x20, 0xfc, 0xff])(
    "cartridge type 0x%s",
    async (type) => {
      const data = seal(fixture());
      data[0x147] = type;
      seal(data);
      await expect(identify(data.buffer)).rejects.toThrow("unsupported format");
    },
  );

  test("a header whose checksum does not match", async () => {
    const data = fixture();
    data[0x14d] ^= 1;
    await expect(identify(data.buffer)).rejects.toThrow("header");
  });

  test.each([
    [0x01, "declares 64 KB for a 32 KB file"],
    [0x09, "declares an undefined size code"],
    [0x52, "declares 72 banks for a 32 KB file"],
    [0x55, "declares an unknown extended size code"],
  ])("size byte 0x%s (%s)", async (declared) => {
    const data = fixture();
    data[0x148] = declared;
    seal(data);
    await expect(identify(data.buffer)).rejects.toThrow("incomplete");
  });
});

describe("identify accepts", () => {
  test("the fixture as a mono program addressed by its SHA-256", async () => {
    const bytes = fixture().buffer;
    const result = await identify(bytes);
    expect(result.bytes).toBe(bytes);
    expect(result.mode).toBe("mono");
    expect(result.contentHash).toBe(await sha256Hex(bytes));
  });

  test.each([0x80, 0xc0])(
    "a color program when byte 0x143 carries 0x%s",
    async (flag) => {
      const data = fixture();
      data[0x143] = flag;
      seal(data);
      const result = await identify(data.buffer);
      expect(result.mode).toBe("color");
    },
  );

  test("a program whose declared size matches a larger file", async () => {
    const bytes = program(64 * KB, (data) => {
      data[0x148] = 0x01;
    });
    await expect(identify(bytes)).resolves.toMatchObject({ mode: "mono" });
  });

  test("the extended size code 0x52 with seventy-two banks", async () => {
    const bytes = program(72 * BANK, (data) => {
      data[0x148] = 0x52;
    });
    await expect(identify(bytes)).resolves.toMatchObject({ mode: "mono" });
  });
});
