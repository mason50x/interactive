"use client";

import { useMutation, useQuery } from "convex/react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Monogram } from "@/components/app/chat/monogram";
import { TYPING_BEAT_MS, typingLabel } from "@/lib/chat";
import { cn } from "@/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { Typist } from "../../../../convex/chat/typing";

/**
 * Who is writing, and the row of dots that says so.
 *
 * Two halves, in the same file because they are two ends of one thing. The
 * hook is the composer's side: it watches the box and beats while there are
 * words in it. The component is everybody else's: the faces, the bubble, and
 * the caption under the thread. Neither knows the other exists except through
 * the `typing` table — see `convex/chat/typing.ts` for the shape of that and
 * what it costs.
 */

/**
 * Say "typing" while the box has words in it, and stop when it does not.
 *
 * Driven off the text rather than off keystrokes, which is what makes it
 * one line in the composer: typing, dictation, a picked mention, a refused
 * message handed back and the clear after a send all arrive here as a
 * change to `body`, and the three that matter — first word, last word gone,
 * words still coming — fall out of comparing it with empty.
 *
 * A keystroke is not a write. The first one is, and after that the beat is
 * sent at most every `TYPING_BEAT_MS` while keys keep coming; a pause longer
 * than the server's window simply lets the row lapse, which is the right
 * answer for somebody who has stopped to think. Clearing the box and leaving
 * the conversation both say so at once, because those are the two cases
 * where waiting out the window would be visibly wrong.
 *
 * `enabled` is the composer's lock. Words in a disabled box should not be
 * counted as typing.
 */
export function useTypingBeat(
  conversationId: Id<"conversations">,
  body: string,
  enabled: boolean,
) {
  const start = useMutation(api.chat.typing.start);
  const stop = useMutation(api.chat.typing.stop);

  /**
   * Whether the last thing said was "typing", and when. Refs rather than
   * state: nothing renders from them, and the cleanup below has to read
   * them from outside any render.
   */
  const said = useRef(false);
  const lastBeat = useRef(0);

  const typing = enabled && body.trim() !== "";

  useEffect(() => {
    if (!typing) {
      if (!said.current) return;
      said.current = false;
      void stop({ conversationId });
      return;
    }
    const now = Date.now();
    if (said.current && now - lastBeat.current < TYPING_BEAT_MS) return;
    said.current = true;
    lastBeat.current = now;
    void start({ conversationId });
    // `body` is the trigger, deliberately: every change is a chance to beat,
    // and the throttle above is what decides whether this one does.
  }, [conversationId, body, typing, start, stop]);

  // Leaving takes the claim with it. Keyed on the conversation so moving to
  // another one unsays it in the room that was left, not the one arrived in.
  useEffect(() => {
    return () => {
      if (!said.current) return;
      said.current = false;
      void stop({ conversationId });
    };
  }, [conversationId, stop]);
}

/**
 * Who is typing in a conversation, right now, on this browser's clock.
 *
 * The subscription re-runs when the table changes and at no other time — so
 * when somebody simply stops, nothing pushes, and a row that has lapsed on
 * the server would sit on screen until somebody else did something. Each
 * row therefore arrives with how long it had left, a timer is set for that
 * long from the moment it lands, and when it fires the row is struck off
 * this answer. Two clocks that disagree by a minute still agree about six
 * seconds, which is why the server hands over a duration and never a time.
 *
 * The struck-off list is remembered against the answer it was struck from,
 * so a fresh answer — somebody beat again, somebody new joined — starts
 * clean and every row in it gets its own fresh timer.
 */
export function useTypists(conversationId: Id<"conversations">): Typist[] {
  const rows = useQuery(api.chat.typing.who, { conversationId });

  const [lapsed, setLapsed] = useState<{ of: typeof rows; ids: string[] }>({
    of: undefined,
    ids: [],
  });

  useEffect(() => {
    if (rows === undefined || rows === null) return;
    const timers = rows.map((row) =>
      // A few milliseconds late rather than early, so the render that
      // follows sees the row as gone rather than as about to be.
      setTimeout(
        () => {
          setLapsed((prev) => ({
            of: rows,
            ids: prev.of === rows ? [...prev.ids, row.clerkId] : [row.clerkId],
          }));
        },
        Math.max(0, row.left) + 20,
      ),
    );
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [rows]);

  return useMemo(() => {
    const gone = lapsed.of === rows ? lapsed.ids : [];
    return (rows ?? []).filter((row) => !gone.includes(row.clerkId));
  }, [rows, lapsed]);
}

/** The most faces drawn beside the bubble. The caption counts the rest. */
const MAX_FACES = 3;

/**
 * The dots.
 *
 * Laid out as a message from somebody else — face in the gutter, bubble
 * beside it, a line under it for the name — so it sits in the thread as the
 * message it is about to be, and the message lands exactly where the dots
 * were. In a group with several people writing the faces stack, up to three,
 * and the caption names them; see `typingLabel` for how it counts past that.
 *
 * ## Arriving and leaving
 *
 * The row grows in and folds away rather than popping — a grid row from
 * `0fr` to `1fr`, on `@starting-style` so the growth happens on the very
 * first paint and needs no second render to trigger it. A browser without
 * `@starting-style` gets the bubble's own pop and no growth, which is fine.
 * On the way out the row keeps drawing the last people it saw while it
 * folds, because a row shrinking over nothing is a row that is already gone;
 * it unmounts when the transition says it has shut. The composer's picture
 * tray does the same thing for the same reason.
 *
 * The thread keeps the reader pinned to the live end while this grows — see
 * the `tail` observer in `Thread` — so the dots never appear just below the
 * fold of a conversation somebody was reading the end of.
 */
export function Typing({ typists }: { typists: Typist[] }) {
  const open = typists.length > 0;

  /** What was last drawn, kept while the row folds shut. */
  const [ghost, setGhost] = useState(typists);
  if (open && ghost !== typists) setGhost(typists);

  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  if (!mounted) return null;

  const faces = ghost.slice(0, MAX_FACES);
  const label = typingLabel(ghost);

  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
        open
          ? "grid-rows-[1fr] opacity-100 starting:grid-rows-[0fr] starting:opacity-0"
          : "grid-rows-[0fr] opacity-0",
      )}
      onTransitionEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        if (!open) setMounted(false);
      }}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="mt-3 flex gap-2.5 pb-px">
          {/* Faces keyed on who they are, so somebody joining slides in
              beside the others rather than the whole stack redrawing. */}
          <div className="flex shrink-0 self-start">
            {faces.map((person, index) => (
              <span
                key={person.clerkId}
                className={cn(
                  "typing-in rounded-full ring-2 ring-background",
                  index > 0 && "-ml-2.5",
                )}
                style={{ "--i": index } as CSSProperties}
              >
                <Monogram
                  handle={person.handle}
                  imageUrl={person.avatarUrl}
                  hue={person.avatarHue}
                  emoji={person.avatarEmoji}
                  initials={person.avatarInitials}
                />
              </span>
            ))}
          </div>

          <div className="flex min-w-0 flex-col items-start">
            <div
              className="typing-in relative rounded-3xl px-3.5 py-2"
              style={{ "--i": faces.length } as CSSProperties}
            >
              {/* The same bubble a message from them is drawn in, behind the
                  dots rather than around them — see `.bubble-theirs`. */}
              <span
                aria-hidden
                className="bubble-theirs absolute inset-0 rounded-3xl border bg-surface-muted"
              />
              <span
                aria-hidden
                className="relative flex h-[1.5rem] items-center gap-[0.3125rem]"
              >
                {[0, 1, 2].map((index) => (
                  <span
                    key={index}
                    className="typing-dot block size-2 rounded-full bg-foreground/60"
                    style={{ "--i": index } as CSSProperties}
                  />
                ))}
              </span>
            </div>

            {/* The line a message keeps for its author's name. A status
                rather than a live region: a reader with a screen reader hears
                "alice is typing" once, not every time the list changes. */}
            <p
              role="status"
              className="mt-1 flex h-5 items-center truncate px-1 text-[0.75rem] text-faint"
            >
              {label}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
