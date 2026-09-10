"use client";

import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { ConversationList } from "@/components/app/chat/conversation-list";
import { HandleGate } from "@/components/app/chat/handle-gate";
import { useChat } from "@/components/app/chat/chat-provider";
import { Spinner } from "@/components/ui/spinner";
import { CHAT_HREF } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** Responsive conversation panes, gated only while the account profile is missing. */
export function ChatFrame({ children }: { children: ReactNode }) {
  const { profile, loading } = useChat();
  const pathname = usePathname();
  const atIndex = pathname === CHAT_HREF;

  if (loading) {
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
