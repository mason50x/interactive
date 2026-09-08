import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  identifyHtml,
  importHtml,
  listHtml,
  MAX_HTML_SAVE_BYTES,
  openHtml,
  readHtmlEntry,
  readHtmlProgram,
  removeHtml,
  renameHtml,
  saveHtml,
  validateHtmlSave,
} from "../../src/lib/simulator/html-store";
const program = (source = "<!doctype html><h1>Local lesson</h1>") =>
  identifyHtml(new TextEncoder().encode(source).buffer, "Lesson");
describe("HTML device persistence", () => {
  it("retains source and progress across connections, isolates owners and rotates bounded slots", async () => {
    const p = await program();
    await importHtml("html-alice", p);
    await saveHtml("html-alice", p.contentHash, { level: 1 });
    await saveHtml("html-alice", p.contentHash, { level: 2 });
    await saveHtml("html-alice", p.contentHash, { level: 2 }, "manual1");
    expect((await readHtmlProgram("html-alice", p.contentHash))?.bytes).toEqual(
      p.bytes,
    );
    expect(await readHtmlProgram("html-bob", p.contentHash)).toBeNull();
    expect(await readHtmlEntry("html-bob", p.contentHash)).toBeUndefined();
    const e = (await readHtmlEntry("html-alice", p.contentHash))!;
    expect(JSON.parse(e.saves.auto!.json)).toEqual({ level: 2 });
    expect(JSON.parse(e.saves.previous!.json)).toEqual({ level: 1 });
    expect(e.saves.manual1?.json).toEqual(e.saves.auto?.json);
    await saveHtml("html-alice", p.contentHash, { level: 2 });
    expect((await readHtmlEntry("html-alice", p.contentHash))?.saves).toEqual(
      e.saves,
    );
    expect(JSON.stringify(e)).not.toContain("<!doctype");
    await renameHtml("html-alice", p.contentHash, "Renamed");
    await importHtml("html-alice", { ...p, label: "Another filename" });
    expect((await readHtmlEntry("html-alice", p.contentHash))?.label).toBe(
      "Renamed",
    );
    expect((await listHtml("html-alice")).length).toBe(1);
    await removeHtml("html-alice", p.contentHash);
    expect(await readHtmlProgram("html-alice", p.contentHash)).toBeNull();
    await expect(
      saveHtml("html-alice", p.contentHash, { level: 3 }),
    ).rejects.toThrow("removed");
  });
  it("rejects wrong-file, oversized and malformed progress without replacing valid saves", async () => {
    const p = await program();
    await importHtml("html-size", p);
    const good = await saveHtml("html-size", p.contentHash, { score: 42 });
    expect(() => validateHtmlSave(good, "f".repeat(64))).toThrow(
      "another file",
    );
    await expect(
      saveHtml("html-size", p.contentHash, "x".repeat(MAX_HTML_SAVE_BYTES)),
    ).rejects.toThrow("limit");
    expect(() =>
      validateHtmlSave({ ...good, json: "{" }, p.contentHash),
    ).toThrow();
    expect(
      (await readHtmlEntry("html-size", p.contentHash))?.saves.auto,
    ).toEqual(good);
    await removeHtml("html-size");
  });
  it("caps libraries and scopes clear to one account", async () => {
    for (let i = 0; i < 20; i++)
      await importHtml("html-cap", await program(`<p>${i}</p>`));
    await expect(
      importHtml("html-cap", await program("<p>21</p>")),
    ).rejects.toThrow();
    const p = await program();
    await importHtml("html-keep", p);
    await removeHtml("html-cap");
    expect(await listHtml("html-cap")).toEqual([]);
    expect(await readHtmlProgram("html-keep", p.contentHash)).not.toBeNull();
    await removeHtml("html-keep");
  });
  it("validates imports before caching and binds identity to bytes", async () => {
    await expect(
      openHtml(new File(["<p>hi</p>"], "lesson.txt")),
    ).rejects.toThrow(".html");
    await expect(program(" ")).rejects.toThrow();
    await expect(program("\0binary")).rejects.toThrow();
    expect(
      (await openHtml(new File(["<p>hi</p>"], "one.html"))).contentHash,
    ).toBe((await openHtml(new File(["<p>hi</p>"], "two.htm"))).contentHash);
  });
});
