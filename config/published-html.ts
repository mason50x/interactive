/** Limits shared by the publisher UI and the authoritative Convex write path. */
export const MAX_PUBLISHED_HTML_BYTES = 2 * 1024 * 1024;
export const MAX_PUBLISHED_HTML_ENTRIES = 200;
export const MAX_PUBLISHED_DESCRIPTION = 280;

export function validatePublishedHtml(source: string) {
  const bytes = new TextEncoder().encode(source);
  if (!source.trim() || source.includes("\0"))
    throw new Error("Use a nonempty UTF-8 HTML document.");
  if (bytes.byteLength > MAX_PUBLISHED_HTML_BYTES)
    throw new Error("Published HTML must be 2 MiB or smaller.");
  return bytes;
}
