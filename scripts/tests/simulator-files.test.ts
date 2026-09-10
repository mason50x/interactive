import { createTestProgram } from "./simulator-fixture.mjs";
import { describe, expect, it } from "vitest";
import {
  identify,
  openProgram,
  programLabel,
} from "../../src/lib/simulator/files";
import {
  importProgress,
  makeProgress,
  STATE_BYTES,
} from "../../src/lib/simulator/progress";
const sample = () => new Uint8Array(createTestProgram()).buffer;
const header = (data: Uint8Array) => {
  let sum = 0;
  for (let i = 0x134; i <= 0x14c; i++) sum = (sum - data[i] - 1) & 255;
  data[0x14d] = sum;
};
describe("simulation file boundary", () => {
  it("matches identical bytes after renaming and retains only a display label", async () => {
    const a = await openProgram(new File([sample()], "first.gb"));
    const b = await openProgram(new File([sample()], "renamed.GB"));
    expect(a.contentHash).toBe(b.contentHash);
    expect(Object.keys(a).sort()).toEqual([
      "bytes",
      "contentHash",
      "label",
      "mode",
    ]);
  });
  it("separates modified content and detects color mode", async () => {
    const a = await identify(sample());
    const data = new Uint8Array(sample());
    data[0x143] = 0x80;
    header(data);
    const b = await identify(data.buffer);
    expect(b.contentHash).not.toBe(a.contentHash);
    expect(b.mode).toBe("color");
  });
  it("rejects wrong extensions, truncation, bad headers and unsupported mappers", async () => {
    await expect(openProgram(new File([sample()], "file.zip"))).rejects.toThrow(
      ".gb",
    );
    await expect(identify(new ArrayBuffer(100))).rejects.toThrow("32 KB");
    const data = new Uint8Array(sample());
    data[0x14d] ^= 1;
    await expect(identify(data.buffer)).rejects.toThrow("header");
    data[0x147] = 0xff;
    header(data);
    await expect(identify(data.buffer)).rejects.toThrow("unsupported");
  });
  it("imports only bounded, matching progress fields", async () => {
    const hash = (await identify(sample())).contentHash;
    const checkpoint = new ArrayBuffer(STATE_BYTES);
    new DataView(checkpoint).setUint32(0, 1800906722, true);
    const progress = makeProgress(hash, "mono", { checkpoint });
    const body = {
      ...progress,
      checkpoint: Buffer.from(checkpoint).toString("base64"),
      rom: "must not persist",
    };
    const imported = await importProgress(
      new File([JSON.stringify(body)], "test.progress"),
      hash,
    );
    expect(imported).not.toHaveProperty("rom");
    expect(imported.checkpoint).toEqual(checkpoint);
    await expect(
      importProgress(
        new File([JSON.stringify(body)], "test.progress"),
        "0".repeat(64),
      ),
    ).rejects.toThrow("different file");
    await expect(
      importProgress(
        new File(
          [JSON.stringify({ ...body, engineBuild: "old" })],
          "test.progress",
        ),
        hash,
      ),
    ).rejects.toThrow("version");
    await expect(
      importProgress(new File([new Uint8Array(750001)], "test.progress"), hash),
    ).rejects.toThrow("too large");
  });
});

it("cleans ROM filenames while retaining meaningful titles", () => {
  expect(
    programLabel("Pokemon - Red Version (USA, Europe) (SGB Enhanced).gb"),
  ).toBe("Pokemon — Red Version");
  expect(programLabel("Super_Mario_Land (World) (Rev 1) [!].gb")).toBe(
    "Super Mario Land",
  );
  expect(programLabel("Zelda (Link’s Awakening).gbc")).toBe(
    "Zelda (Link’s Awakening)",
  );
  expect(programLabel("[!].gb")).toBe("Imported simulation");
});
