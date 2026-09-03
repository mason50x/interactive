/**
 * Getting a picture ready to leave the browser.
 *
 * ## Why the browser shrinks it
 *
 * A phone photograph is four thousand pixels across and several megabytes,
 * and a chat bubble is three hundred pixels across. Uploading the original
 * would store ten times the bytes anybody will ever see, and storage is the
 * one thing about pictures that is billed. So the file is decoded here,
 * drawn onto a canvas no larger than `MAX_EDGE` on its longest side, and
 * re-encoded — which also turns every format the browser can read into one
 * of the four the server accepts, see `IMAGE_TYPES` in
 * `convex/moderation/limits.ts`.
 *
 * ## The re-encode is also the privacy step
 *
 * A canvas holds pixels and nothing else. Drawing a photograph through one
 * and encoding the result drops everything the camera wrote into the file:
 * the make and model, the time, and — on nearly every phone — the GPS
 * position it was taken at. On a site whose users are thirteen, a picture of
 * a bedroom with the bedroom's coordinates inside it is the single worst
 * thing an upload path can quietly ship, and this is what stops it. The
 * orientation tag is the one piece of that metadata worth honouring, and
 * `createImageBitmap` is asked to apply it before the pixels are drawn, so a
 * photo taken sideways is not shrunk sideways.
 *
 * ## What is left alone
 *
 * A GIF under the size cap goes up as it is. Re-encoding one keeps a single
 * frame, and a GIF with one frame is a broken GIF; the metadata argument
 * does not apply because the format has nowhere to put a location. A GIF
 * over the cap is treated as a picture and loses its motion, which is the
 * lesser of refusing it and storing it.
 *
 * None of this is trusted by the server. It reads the type and size from
 * storage and bounds the dimensions itself — see `claim` in
 * `convex/chat/attachments.ts`. This is the client being a good citizen,
 * and the reason a good citizen's uploads are a few hundred kilobytes.
 */

/**
 * Pictures on one message. Mirrors `MAX_IMAGES_PER_MESSAGE` in
 * `convex/moderation/limits.ts`, for the reason every mirrored constant in
 * `src/lib/chat.ts` gives: the server bundles from `convex/` and the browser
 * from `src/`, and the server is the one that decides.
 */
export const MAX_IMAGES_PER_MESSAGE = 4;

/** Mirrors `MAX_IMAGE_BYTES` there. Here it is when to give up, not a rule. */
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/**
 * The longest a shrunk picture's longest side will be.
 *
 * Wide enough to open full-size on a laptop screen and read a screenshot's
 * text; a quarter of the pixels of a phone photo, which is a tenth of the
 * bytes once encoded.
 */
const MAX_EDGE = 2048;

/** What a JPEG or WebP is encoded at. Visually clean; far from lossless. */
const QUALITY = 0.86;

/** A picture, ready to upload. */
export type PreparedImage = {
  blob: Blob;
  width: number;
  height: number;
};

/**
 * The previews of pictures this browser has sent, by attachment id.
 *
 * The blob that was uploaded is, pixel for pixel, the file the server now
 * holds — so when the real message arrives there is nothing to fetch. Without
 * this the thread drew the preview in the placeholder, dropped it, and then
 * drew a grey box until the same bytes came back down: a flash, on every
 * picture you sent, at the one moment you were looking straight at it.
 *
 * Bounded, because an object URL holds its blob in memory until it is
 * revoked. Twenty-four pictures is more than one sitting sends and, at the
 * size `prepareImage` produces, a few megabytes at worst. The oldest is
 * revoked when the twenty-fifth arrives; from then on that picture is fetched
 * like anybody else's.
 */
const previews = new Map<string, string>();
const PREVIEWS_KEPT = 24;

export function rememberPreview(attachmentId: string, url: string): void {
  previews.set(attachmentId, url);
  if (previews.size <= PREVIEWS_KEPT) return;
  const oldest = previews.keys().next().value;
  if (oldest === undefined) return;
  const gone = previews.get(oldest);
  previews.delete(oldest);
  if (gone !== undefined) URL.revokeObjectURL(gone);
}

export function previewFor(attachmentId: string): string | undefined {
  return previews.get(attachmentId);
}

/** Whether a file is worth trying at all. The server is the real check. */
export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

/**
 * Shrink and re-encode, or pass through — see the note at the top.
 *
 * `null` is a file the browser could not decode. The common case is HEIC
 * from an iPhone on a browser that is not Safari, and the honest answer is
 * that it cannot be sent from here rather than a spinner that never stops.
 */
export async function prepareImage(file: File): Promise<PreparedImage | null> {
  if (!isImageFile(file)) return null;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }

  try {
    const { width, height } = bitmap;
    if (width === 0 || height === 0) return null;

    if (file.type === "image/gif" && file.size <= MAX_IMAGE_BYTES) {
      return { blob: file, width, height };
    }

    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (context === null) return null;
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    const blob = await encode(canvas, file.type);
    if (blob === null) return null;

    return { blob, width: targetWidth, height: targetHeight };
  } finally {
    bitmap.close();
  }
}

/**
 * WebP where the browser can write it, and otherwise the format the picture
 * came in — PNG keeps a screenshot's edges and its transparency, JPEG is
 * everything else. A browser that cannot encode the format it was asked for
 * hands back a PNG and says so in `type`, which is how the fallback is
 * detected rather than guessed from a user agent.
 */
async function encode(
  canvas: HTMLCanvasElement,
  original: string,
): Promise<Blob | null> {
  const webp = await toBlob(canvas, "image/webp", QUALITY);
  if (webp !== null && webp.type === "image/webp") return webp;

  if (original === "image/png") return await toBlob(canvas, "image/png");
  return await toBlob(canvas, "image/jpeg", QUALITY);
}

function toBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
