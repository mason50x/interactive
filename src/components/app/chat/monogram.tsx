import type { CSSProperties } from "react";
import { handleHue } from "@/lib/chat";
import { cn } from "@/lib/utils";

/**
 * A person, drawn as a letter.
 *
 * Chat has no avatars and this is the reason: the only picture this app holds
 * is the one Clerk collected at signup, and a photograph of a thirteen-year-old
 * next to their messages in a room of strangers is the worst available default.
 * It would also mean the thread query had to join against the account table,
 * which is the table chat is built to stay out of entirely.
 *
 * So a letter, on a colour derived from the handle — stable for everybody
 * looking at it, stored nowhere, and needing no request to draw.
 *
 * Both halves may be overridden, and for two different reasons. A group is a
 * thing several people share rather than a person, and naming it is not the
 * same as picking what it looks like — so it carries an `emoji` and a `hue`. A
 * person may now do the same with `initials` and a `hue`, which is as far as
 * "choose your picture" goes here and deliberately so.
 *
 * None of it is free text: `emoji` comes from the fixed set in
 * `src/lib/chat.ts`, `hue` from the fixed wheel beside it, and `initials` from
 * a two-character shape the server checks. That is what keeps a picked picture
 * from being an uploaded one.
 *
 * Every override is optional and they fall back independently — a hue with no
 * initials is your first letter on a colour you chose, initials with no hue is
 * your initials on the colour your handle hashes to.
 */
export function Monogram({
  handle,
  emoji,
  initials,
  hue: given,
  className,
}: {
  handle: string;
  emoji?: string;
  initials?: string;
  hue?: number;
  className?: string;
}) {
  const hue = given ?? handleHue(handle);

  return (
    <span
      aria-hidden
      className={cn(
        "monogram flex size-8 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-semibold select-none",
        className,
      )}
      // Only the hue crosses over. The lightness and chroma are in
      // `globals.css`, which is the one place that can hold a dark variant for
      // them — see `.monogram` there.
      style={{ "--monogram-hue": hue } as CSSProperties}
    >
      {emoji ?? initials ?? handle.slice(0, 1)}
    </span>
  );
}
