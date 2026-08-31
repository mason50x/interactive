"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AgreementRequired } from "@/components/app/agreement-required";
import { useAgreement } from "@/components/app/agreement-provider";
import { ConversationList } from "@/components/app/chat/conversation-list";
import { HandleGate } from "@/components/app/chat/handle-gate";
import { useChat } from "@/components/app/chat/chat-provider";
import { Spinner } from "@/components/ui/spinner";
import { CHAT_HREF } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * The two panes, and the three things that stand in front of them.
 *
 * ## Why the agreement is checked here and not in the layout
 *
 * It was in the layout, which is a server component, and that was wrong in a
 * way only showed up in use: accepting the terms is a Convex mutation, and a
 * server component does not re-render because a subscription changed. So the
 * card came down in the rail, the activities unlocked, and chat carried on
 * saying it was locked until the page was reloaded by hand.
 *
 * `useAgreement` is the live value — server-seeded in the dashboard layout so
 * the first paint is right, and a subscription after that so the moment the
 * acceptance lands this swaps. The real gate is not here at all: it is in
 * `chat.messages.send` and `chat.profiles.claimHandle`, which is the only place
 * it can be, because those are called by a browser directly.
 *
 * The `null` check is deliberate and is the documented trap — `null` means "not
 * known yet", so refusing on `!agreed` would flash the locked page at everyone
 * on every cold load. Only `agreed === false` refuses.
 *
 * ## The panes
 *
 * Below `md` the two are one and the route decides which. The width lives on
 * the wrapper rather than inside `ConversationList`, because the wrapper is the
 * flex item — putting `w-full` here and a fixed width inside it made the list
 * claim the whole row on desktop and squeezed the thread off the right edge.
 */
export function ChatFrame({ children }: { children: ReactNode }) {
  const { profile, loading } = useChat();
  const agreement = useAgreement();
  const pathname = usePathname();
  const atIndex = pathname === CHAT_HREF;

  if (agreement?.agreed === false) return <AgreementRequired title="Chat" />;

  if (loading || agreement === null) {
    return (
      <div className="flex size-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (profile === null) return <HandleGate />;

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
