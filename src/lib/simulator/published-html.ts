import { MAX_PUBLISHED_HTML_BYTES } from "@config/published-html";
import {
  identifyHtml,
  importHtml,
  listHtml,
  removeHtml,
  renameHtml,
  type HtmlProgram,
} from "./html-store";

/** Separate from personal libraries and from every other account/template. */
export function publishedHtmlOwner(userId: string, entryId: string) {
  return `published:${entryId}:${userId}`;
}

/** Bound downloads before decoding, then verify the exact server-published bytes. */
export async function downloadPublishedHtml(
  entry: {
    url: string;
    contentHash: string;
    label: string;
    byteLength: number;
  },
  signal?: AbortSignal,
): Promise<HtmlProgram> {
  if (entry.byteLength > MAX_PUBLISHED_HTML_BYTES)
    throw new Error("Published HTML exceeds the 2 MiB limit.");
  const response = await fetch(entry.url, {
    signal,
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok || !response.body)
    throw new Error(
      "This simulation could not be downloaded. Retry to load the latest version.",
    );
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PUBLISHED_HTML_BYTES || size > entry.byteLength)
        throw new Error("Published HTML has an invalid file size.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  if (size !== entry.byteLength)
    throw new Error("The download was incomplete. Please retry.");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const program = await identifyHtml(bytes.buffer, entry.label);
  if (program.contentHash !== entry.contentHash)
    throw new Error(
      "The downloaded HTML did not match the published version. Please retry.",
    );
  return program;
}

export async function cachePublishedHtml(owner: string, program: HtmlProgram) {
  // Source changes start fresh progress; metadata-only edits keep the same hash.
  // Keep just the current version so repeated edits do not fill device storage.
  await importHtml(owner, program);
  await renameHtml(owner, program.contentHash, program.label);
  for (const entry of await listHtml(owner)) {
    if (entry.contentHash !== program.contentHash)
      await removeHtml(owner, entry.contentHash);
  }
}
