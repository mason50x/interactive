import { Photo } from "@/components/app/chat/photo";
import type { ChatGif } from "@convex/chat/messages";

/** The longest either side of a GIF may be, in pixels. */
const EDGE = 280;

/**
 * A GIF on a message, drawn straight from KLIPY's link — see
 * `src/lib/klipy.ts` for why it is never copied to our own storage.
 *
 * Sized like a lone picture: its own shape, capped on both sides, with the
 * box drawn before the bytes arrive so the thread does not jump.
 */
export function MessageGif({ gif }: { gif: ChatGif }) {
  const ratio = gif.width / gif.height;
  const width = Math.round(Math.min(gif.width, EDGE, EDGE * ratio));
  return (
    <div
      // A fixed width with a `max-width` cap, not `min(100%, …)`: the column
      // around it is sized by its content, so a percentage here resolves
      // against nothing, the column stretches to its maximum, and the hover
      // actions end up at the far side of an empty gap.
      className="max-w-full overflow-hidden rounded-3xl bg-surface-muted"
      style={{
        aspectRatio: `${gif.width} / ${gif.height}`,
        width: `${width}px`,
      }}
    >
      <Photo
        src={gif.url}
        width={gif.width}
        height={gif.height}
        alt={gif.title ?? "GIF"}
        loading="lazy"
        className="size-full object-cover"
      />
    </div>
  );
}
