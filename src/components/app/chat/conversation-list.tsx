"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChatTools } from "@/components/app/chat/chat-tools";
import { GroupRowActions } from "@/components/app/chat/group-panel";
import { useChat } from "@/components/app/chat/chat-provider";
import { Monogram } from "@/components/app/chat/monogram";
import { conversationName } from "@/lib/chat";
import { CHAT_HREF } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Everywhere you can talk, with the room at the top.
 *
 * The room is pinned rather than sorted, because it has no `lastMessageAt` to
 * sort by — see `conversations` in `convex/schema.ts` for why writing one on
 * every message in it would be the most expensive field in the schema.
 *
 * Unread reads two ways on purpose. A direct message or a group shows a count,
 * because somebody said something *to you* and how much of it matters. The room
 * shows a dot, because "four hundred and twelve people have spoken since you
 * last looked" is not information anybody acts on.
 *
 * Everything that is not a conversation — adding people, answering requests,
 * who may reach you, starting a group — opens above the list rather than on a
 * page of its own. See `ChatTools`.
 *
 * While one of those is open it has the column to itself: the list goes,
 * because a panel that pushes the conversations down is a panel you have to
 * scroll past, and because the header has stopped saying your handle and
 * started saying the panel's name. Hidden rather than unmounted, so a long
 * list comes back scrolled where you left it.
 */
export function ConversationList() {
  const { conversations } = useChat();
  const pathname = usePathname();
  const [toolsOpen, setToolsOpen] = useState(false);

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <ChatTools onOpenChange={setToolsOpen} />

      {/* `hidden` as a class and not as the attribute: the attribute's
          `display: none` comes from the user-agent sheet, and the `flex` here
          would win over it. `cn` drops `flex` when both are present. */}
      <ul
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3",
          toolsOpen && "hidden",
        )}
      >
        {conversations.map((conversation) => {
          const href = `${CHAT_HREF}/${conversation._id}`;
          const active = pathname === href;
          const name = conversationName(conversation);
          const unread = conversation.unread > 0;
          const group = conversation.kind === "group";
          const canInvite = group && conversation.role !== "member";

          return (
            // The row is a link with buttons *beside* it rather than inside it:
            // a button is interactive content and an anchor may not contain
            // any. So the link fills the row, the controls sit over its right
            // end, and only one of them is ever under the pointer.
            <li key={conversation._id} className="relative">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-2 py-2 transition-colors",
                  active
                    ? "bg-foreground/[0.06]"
                    : "hover:bg-foreground/[0.035]",
                  // Room kept for the controls beside it, so the unread count
                  // has somewhere to sit that is not underneath them. Held
                  // rather than revealed on hover: this column is a page of its
                  // own on a phone, where there is no hover to reveal with.
                  group && (canInvite ? "pr-[4.5rem]" : "pr-11"),
                )}
              >
                <Monogram
                  handle={name}
                  emoji={conversation.emoji}
                  hue={conversation.hue}
                />

                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-[0.9375rem]",
                      unread ? "font-semibold" : "font-medium",
                    )}
                  >
                    {conversation.kind === "dm" ? `@${name}` : name}
                  </span>
                  <span className="block truncate text-[0.75rem] text-faint">
                    {conversation.kind === "global"
                      ? "Everyone here"
                      : conversation.kind === "group"
                        ? "Group"
                        : "Direct message"}
                  </span>
                </span>

                {/* A count where a count means something, a dot where it does
                    not. See the note at the top of this file. */}
                {unread ? (
                  conversation.unreadExact ? (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[0.6875rem] font-semibold text-primary-foreground">
                      {conversation.unread > 99 ? "99+" : conversation.unread}
                    </span>
                  ) : (
                    <span className="size-2 shrink-0 rounded-full bg-primary" />
                  )
                ) : null}
              </Link>

              {group ? (
                <div className="absolute inset-y-0 right-2 flex items-center gap-0.5">
                  <GroupRowActions
                    conversationId={conversation._id}
                    canInvite={canInvite}
                  />
                </div>
              ) : null}
            </li>
          );
        })}

        {conversations.length === 0 ? (
          <li className="px-2 py-6 text-[0.875rem] leading-relaxed text-muted-foreground">
            Nothing yet. The room should be here in a moment.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
