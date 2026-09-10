import type { CSSProperties } from "react";
import {
  BUBBLE_PIXELS,
  BUBBLE_SAYING,
} from "@/components/app/chat/thread/bubble-art";

/**
 * An empty thread.
 *
 * A conversation with nothing in it is not an error and should not be reported
 * like one, so the line is set at the weight of something being told to you
 * rather than the grey of a caption apologising. Above it, the thing that would
 * be there if somebody were typing: an empty bubble, turning, with the three
 * dots already going. It is not a status — nobody is typing, and it says so by
 * being the only thing on the screen — it is the shape of what this pane is
 * for, held up for a second before anybody has used it.
 *
 * `flex-1` inside the scroller, so this centres in the pane rather than sitting
 * at the top of an empty column. Everything about how it is built is in
 * `.dot-bubble` in `globals.css`; the pixels themselves are `bubble-art.ts`.
 */
export function Quiet({ archived = false }: { archived?: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-10">
      {/* The accent, like the search orb — the two pieces of decoration in the
          app are painted in whatever colour the account picked. */}
      <div aria-hidden className="dot-bubble text-primary">
        <div className="dot-bubble-shell">
          {BUBBLE_PIXELS.map((pixel) => (
            <span
              key={pixel.key}
              className="dot-bubble-pixel"
              style={
                {
                  "--x": pixel.x,
                  "--y": pixel.y,
                  "--z": pixel.z,
                  "--near": pixel.near,
                  "--far": pixel.far,
                  "--phase": pixel.phase,
                  "--rest": pixel.rest,
                } as CSSProperties
              }
            />
          ))}

          {BUBBLE_SAYING.map((x, index) => (
            <span
              key={x}
              className="dot-bubble-say"
              // The stagger is an index rather than a delay, so the three of
              // them stay in step with each other if the timing changes.
              style={{ "--x": x, "--y": -4, "--i": index } as CSSProperties}
            />
          ))}
        </div>
      </div>

      <p className="text-center text-[0.9375rem] font-semibold text-foreground">
        {archived
          ? "Nothing was said here on this day."
          : "Nothing has been said here yet."}
      </p>
    </div>
  );
}
