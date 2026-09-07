"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ConversationList } from "@/components/app/chat/conversation-list";
import { HandleGate } from "@/components/app/chat/handle-gate";
import { useChat } from "@/components/app/chat/chat-provider";
import { Spinner } from "@/components/ui/spinner";
import { CHAT_HREF } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * The chat panes and handle setup.
 *
 * ## Why the handle screen can outlive its own reason for being here
 *
 * `profile === null` is what puts the gate up, and the profile landing is what
 * takes it down — which for a screen that ends in a two-second handoff from
 * your photograph to your monogram would mean cutting that handoff off on its
 * first frame. So the gate can ask to be held: `held` is set by it before the
 * claim is sent and cleared when the ceremony has played, and either that or a
 * missing profile keeps it on screen. Nothing else in this file knows what the
 * hold is for. See `handle-gate.tsx`.
 *
 * ## The panes
 *
 * Below `md` the two are one and the route decides which. The width lives on
 * the wrapper rather than inside `ConversationList`, because the wrapper is the
 * flex item — putting `w-full` here and a fixed width inside it made the list
 * claim the whole row on desktop and squeezed the thread off the right edge.
 *
 * Full-bleed on purpose: the list is a side column, and a side column sits
 * against the side. It does not share the header's centred gutter, so the
 * wordmark and "My Feed" are not meant to line up.
 */
export function ChatFrame({ children }: { children: ReactNode }) {
  const { profile, loading } = useChat();
  const pathname = usePathname();
  const [held, setHeld] = useState(false);
  const atIndex = pathname === CHAT_HREF;

  if (loading) {
    return (
      <div className="flex size-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (profile === null || held) return <HandleGate onHold={setHeld} />;

  return (
    <div className="flex size-full min-h-0">
      <div
        className={cn(
          "min-h-0 shrink-0 md:w-72 md:border-r md:border-border lg:w-80",
          atIndex ? "flex w-full" : "hidden md:flex",
        )}
      >
        <ConversationList />
      </div>

      <div
        className={cn(
          "min-h-0 min-w-0 flex-1",
          atIndex ? "hidden md:flex" : "flex",
        )}
      >
        {children}
      </div>
    </div>
  );
}
