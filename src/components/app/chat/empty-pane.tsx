"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useChat } from "@/components/app/chat/chat-provider";
import { CHAT_HREF } from "@/lib/nav";

/** The width `ChatFrame` splits at, written the way `matchMedia` wants it.
 *  Tailwind's `md`, which is where the two panes become two. */
const WIDE = "(min-width: 48rem)";

/**
 * The right-hand pane with nothing in it, which it tries not to be.
 *
 * Arriving at chat and being told to pick something is the app asking a
 * question it can answer itself: there is always a room, everybody is in it,
 * and it is the one conversation that is never empty. So on a screen wide
 * enough to show both panes at once this steps aside and opens the room — the
 * list is still there on the left, nothing is hidden, and the pane that would
 * have held an instruction holds a conversation instead.
 *
 * `replace` and not `push`, because the empty pane is not a place anybody was:
 * putting it in the history would make Back a step sideways into the screen
 * they just left, and then out of chat only on the second press.
 *
 * The width check is the whole reason this is a component and not a redirect on
 * the server. Below `md` this route *is* the conversation list — see
 * `ChatFrame` — and opening the room there would replace the list with a room
 * nobody asked for and no way back to the list but the browser's own Back.
 * The pane is still mounted at that width, only hidden, so the check has to be
 * made here rather than left to CSS.
 *
 * The sentence survives for the two cases the redirect cannot cover: a narrow
 * screen, and the moment before the subscription has said what conversations
 * exist. It is what somebody sees if the room is not there at all.
 */
export function EmptyPane() {
  const { conversations } = useChat();
  const router = useRouter();

  const room = conversations.find(
    (conversation) => conversation.kind === "global",
  );
  const roomId = room?._id;

  useEffect(() => {
    if (!roomId) return;
    if (!window.matchMedia(WIDE).matches) return;

    router.replace(`${CHAT_HREF}/${roomId}`);
  }, [roomId, router]);

  return (
    <div className="flex size-full items-center justify-center p-6">
      <p className="max-w-xs text-center text-[0.9375rem] leading-relaxed text-muted-foreground">
        Pick a conversation, or start one from People.
      </p>
    </div>
  );
}
