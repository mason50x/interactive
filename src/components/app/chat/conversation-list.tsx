"use client";

import { UserPlusIcon } from "@heroicons/react/24/solid";
import { useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChatTools, type Panel } from "@/components/app/chat/chat-tools";
import {
  GroupColumn,
  GroupRowActions,
} from "@/components/app/chat/group-panel";
import { useChat } from "@/components/app/chat/chat-provider";
import { Monogram } from "@/components/app/chat/monogram";
import {
  conversationName,
  onGroupPanelRequest,
  type GroupPanelRequest,
} from "@/lib/chat";
import { CHAT_HREF } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

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
 *
 * A group's own panels are the same kind of thing and are drawn the same way —
 * see `GroupColumn`. They are the one takeover this column does not open for
 * itself: the cog on a group's row is here, but the one in the thread header is
 * in the other pane, so both of them ask rather than tell. `onGroupPanelRequest`
 * is that ask, and it is a window event for the reason set out where it is
 * defined.
 *
 * The two kinds of takeover are one at a time. Opening a group's panel puts
 * away whichever tool was open and the other way about, because the column has
 * one face and these are two of them.
 *
 * The last row is not a conversation. Somebody with no friends has a room full
 * of strangers and nothing else, and the only thing that changes that is behind
 * a button in the header — which is the one place a new arrival has no reason
 * to look. So the gap where their first friend would be says what it is and
 * opens People when pressed, and it goes the moment there is a friend to fill
 * it. Drawn grey and dashed rather than as a live row, because it is a space
 * for a person and not a person.
 */
export function ConversationList() {
  const { conversations } = useChat();
  const pathname = usePathname();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [groupPanel, setGroupPanel] = useState<GroupPanelRequest | null>(null);

  // Asked for from a group's row here, and from the cog in the thread header
  // over in the other pane. Both land here, and either one closes whatever the
  // column was showing.
  useEffect(
    () =>
      onGroupPanelRequest((request) => {
        setGroupPanel(request);
        setPanel(null);
      }),
    [],
  );

  // `undefined` while it is still being asked, which is not the same as nobody
  // — the row would otherwise flash up on every load for people who have
  // friends. Friends rather than direct messages: you can be friends with
  // somebody you have not written to yet, and that is not an empty gap.
  const friends = useQuery(api.chat.friends.list, {});
  const alone = friends !== undefined && friends.length === 0;

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* Mounted only while it is being looked at — it subscribes to the group
          it is about — and it is the whole column while it is. What it replaces
          is hidden rather than unmounted for the reason the list is hidden
          under a tool panel: a column of conversations scrolled half way down
          should still be there when you come back to it. */}
      {groupPanel === null ? null : (
        <GroupColumn
          conversationId={groupPanel.conversationId as Id<"conversations">}
          mode={groupPanel.mode}
          onBack={() => setGroupPanel(null)}
        />
      )}

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          groupPanel !== null && "hidden",
        )}
      >
        <ChatTools open={panel} onOpenChange={setPanel} />

        {/* `hidden` as a class and not as the attribute: the attribute's
          `display: none` comes from the user-agent sheet, and the `flex` here
          would win over it. `cn` drops `flex` when both are present. */}
        <ul
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3",
            panel !== null && "hidden",
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

          {alone ? (
            <li>
              <button
                type="button"
                onClick={() => setPanel("people")}
                className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-foreground/[0.035]"
              >
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground"
                >
                  <UserPlusIcon className="size-4" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-medium text-muted-foreground">
                    Add a friend
                  </span>
                  <span className="block truncate text-[0.75rem] text-faint">
                    Nobody here yet
                  </span>
                </span>
              </button>
            </li>
          ) : null}

          {conversations.length === 0 ? (
            <li className="px-2 py-6 text-[0.875rem] leading-relaxed text-muted-foreground">
              Nothing yet. The room should be here in a moment.
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
