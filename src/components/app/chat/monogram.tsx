import type { CSSProperties } from "react";
import { LogoMark } from "@/components/wordmark";
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
 *
 * The letters are raised here and not in the stylesheet. `text-transform` is
 * ruled out project-wide, and rightly — but that rule is about type being *set*
 * in a case it was not written in, and this is not type being set. It is one or
 * two letters standing in for a person on a disc, which is a mark, and a mark
 * has no lowercase. Handles are stored lowercase and initials are typed however
 * they are typed, so without this the same disc reads `ms` next to somebody
 * else's `MS`. The account avatar in the rail has always done this.
 *
 * The emoji is left exactly as it came. Uppercasing it is a no-op, and doing it
 * anyway would be an invitation to wonder why.
 *
 * `brand` is the one exception to all of it. The room everybody is in is not a
 * person and not a group somebody made — it is the app itself, so it is drawn
 * as the app's mark rather than as an `E` on a colour the string "Everyone"
 * happened to hash to. No disc under it: every other face here is ink inside a
 * tinted circle, and a mark with nothing behind it is the one thing in the
 * column that cannot be mistaken for somebody. It takes `currentColor`, so it
 * is the row's own ink in both themes and it dims with the row.
 */
export function Monogram({
  handle,
  emoji,
  initials,
  hue: given,
  brand,
  className,
}: {
  handle: string;
  emoji?: string;
  initials?: string;
  hue?: number;
  brand?: boolean;
  className?: string;
}) {
  const hue = given ?? handleHue(handle);

  if (brand) {
    return (
      <span
        aria-hidden
        className={cn(
          "flex size-8 shrink-0 items-center justify-center select-none",
          className,
        )}
      >
        {/* Sized as a share of the slot rather than in fixed units, so the one
            component serves the list, the header and anywhere else the disc is
            resized by `className`. Wider than a disc's letter would be: with no
            circle around it, the mark needs the extra width to carry the same
            weight as the faces beside it. */}
        <LogoMark className="h-[65%] w-[72%]" />
      </span>
    );
  }

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
      {emoji ?? (initials ?? handle.slice(0, 1)).toUpperCase()}
    </span>
  );
}
