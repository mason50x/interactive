import "fake-indexeddb/auto";
import { afterEach, expect, test, vi } from "vitest";
import {
  cachePublishedHtml,
  downloadPublishedHtml,
  publishedHtmlOwner,
} from "../../src/lib/simulator/published-html";
import {
  identifyHtml,
  importHtml,
  listHtml,
  readHtmlEntry,
  readHtmlProgram,
  removeHtml,
  saveHtml,
} from "../../src/lib/simulator/html-store";
import { MAX_PUBLISHED_HTML_BYTES } from "../../config/published-html";
afterEach(() => vi.unstubAllGlobals());
const source = "<!doctype html><p>Hello</p>";
const program = () =>
  identifyHtml(new TextEncoder().encode(source).buffer, "Hello");

test("published progress is private per account/template and separate from personal saves", async () => {
  const p = await program();
  const owner = publishedHtmlOwner("alice", "template-one");
  await importHtml("alice", p);
  await saveHtml("alice", p.contentHash, { personal: true });
  await cachePublishedHtml(owner, p);
  expect((await readHtmlEntry(owner, p.contentHash))?.saves).toEqual({});
  await saveHtml(owner, p.contentHash, { sharedPlay: 5 });
  await cachePublishedHtml(owner, { ...p, label: "Renamed" });
  expect((await readHtmlEntry(owner, p.contentHash))?.saves.auto?.json).toBe(
    '{"sharedPlay":5}',
  );
  expect((await readHtmlEntry(owner, p.contentHash))?.label).toBe("Renamed");
  expect(
    await readHtmlEntry(
      publishedHtmlOwner("bob", "template-one"),
      p.contentHash,
    ),
  ).toBeUndefined();
  expect(
    await readHtmlEntry(
      publishedHtmlOwner("alice", "template-two"),
      p.contentHash,
    ),
  ).toBeUndefined();
  expect(await listHtml("alice")).toHaveLength(1);
  await removeHtml("alice");
  expect(await readHtmlProgram(owner, p.contentHash)).not.toBeNull();
  const next = await identifyHtml(
    new TextEncoder().encode("<p>Updated code</p>").buffer,
    "New",
  );
  await cachePublishedHtml(owner, next);
  expect(await listHtml(owner)).toHaveLength(1);
  expect((await readHtmlEntry(owner, next.contentHash))?.saves).toEqual({});
  expect(await readHtmlProgram(owner, p.contentHash)).toBeNull();
});

test("downloads verify size and hash before any source is cached", async () => {
  const p = await program();
  const entry = {
    url: "https://example.invalid/file",
    contentHash: p.contentHash,
    label: "Hello",
    byteLength: p.bytes.byteLength,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(source)),
  );
  expect((await downloadPublishedHtml(entry)).bytes).toEqual(p.bytes);
  await expect(
    downloadPublishedHtml({ ...entry, contentHash: "a".repeat(64) }),
  ).rejects.toThrow("did not match");
  await expect(
    downloadPublishedHtml({ ...entry, byteLength: entry.byteLength - 1 }),
  ).rejects.toThrow("file size");
  await expect(
    downloadPublishedHtml({ ...entry, byteLength: entry.byteLength + 1 }),
  ).rejects.toThrow("incomplete");
  await expect(
    downloadPublishedHtml({
      ...entry,
      byteLength: MAX_PUBLISHED_HTML_BYTES + 1,
    }),
  ).rejects.toThrow("limit");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("missing", { status: 404 })),
  );
  await expect(downloadPublishedHtml(entry)).rejects.toThrow(
    "could not be downloaded",
  );
});
