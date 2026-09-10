"use client";

import { AtSymbolIcon } from "@heroicons/react/24/outline";
import { UserPlusIcon } from "@heroicons/react/24/solid";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { People, SearchField } from "@/components/app/chat/chat-search";
import { ChatTools, type Panel } from "@/components/app/chat/chat-tools";
import {
  GroupColumn,
  GroupRowActions,
} from "@/components/app/chat/group-panel";
import { useChat } from "@/components/app/chat/chat-provider";
import { GlideList } from "@/components/app/chat/glide-list";
import { Monogram } from "@/components/app/chat/monogram";
import { Waiting } from "@/components/app/chat/waiting";
import {
  conversationName,
  onGroupPanelRequest,
  type GroupPanelRequest,
} from "@/lib/chat";
import { CHAT_HREF } from "@/lib/nav";
import { cn } from "@/lib/utils";
import type { Id } from "../../../../convex/_generated/dataModel";
import { CountBadge } from "@/components/ui/badge";

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
 * Settings and a new group open above the list rather than on a page of their
 * own — see `ChatTools`. While one of those is open it has the column to
 * itself: the list goes, because a panel that pushes the conversations down is
 * a panel you have to scroll past, and because the header has stopped saying
 * your handle and started saying the panel's name. Hidden rather than
 * unmounted, so a long list comes back scrolled where you left it.
 *
 * A group's own panels are the same kind of thing and are drawn the same way —
 * see `GroupColumn`. They are the one takeover this column does not open for
 * itself: the cog on a group's row is here, but the one in the thread header is
 * in the other pane, so both of them ask rather than tell. `onGroupPanelRequest`
 * is that ask, and it is a window event for the reason set out where it is
 * defined.
 *
 * ## Finding people
 *
 * Under the header is one field for both things a field there is for: a
 * conversation you already have, and a person you do not. The list filters
 * itself against it, and from the second character the handle index is asked
 * for anybody else — see `chat-search.tsx`. A person found is pressed to open
 * their card, which is where Message and Add live. The requests waiting on you
 * sit above the conversations rather than behind a button — see `Waiting`.
 */
export function ConversationList() {
  const { conversations } = useChat();
  const pathname = usePathname();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [groupPanel, setGroupPanel] = useState<GroupPanelRequest | null>(null);

  const [term, setTerm] = useState("");
  const field = useRef<HTMLInputElement>(null);

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

  const needle = term.trim().toLowerCase();

  const shown = useMemo(() => {
    if (needle === "") return conversations;
    return conversations.filter((conversation) => {
      const name = conversationName(conversation).toLowerCase();
      return (
        name.includes(needle) ||
        (conversation.peerHandle?.includes(needle) ?? false)
      );
    });
  }, [conversations, needle]);

  // Whoever already has a thread here, so the People section under the list
  // does not offer to start a conversation that is two rows up.
  const known = useMemo(
    () =>
      new Set(
        conversations.flatMap((conversation) =>
          conversation.peerClerkId === undefined
            ? []
            : [conversation.peerClerkId],
        ),
      ),
    [conversations],
  );

  // Somebody with no direct messages has a room full of strangers and nothing
  // else. The gap where their first one would be says what it is and puts the
  // caret in the field, and it goes the moment there is a thread to fill it.
  const alone =
    needle === "" && !conversations.some((row) => row.kind === "dm");

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
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            panel !== null && "hidden",
          )}
        >
          <div className="shrink-0 px-3 pb-2">
            <SearchField term={term} onTermChange={setTerm} fieldRef={field} />
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-3">
            {needle === "" ? <Waiting /> : null}

            {/* One highlight glides between the rows rather than each row
                lighting up on its own — see `GlideList`. */}
            <GlideList listClassName="flex flex-col gap-0.5 px-2">
              {shown.map((conversation) => {
                const href = `${CHAT_HREF}/${conversation._id}`;
                const active = pathname === href;
                const name = conversationName(conversation);
                const unread = conversation.unread > 0;
                const group = conversation.kind === "group";
                const canInvite = group && conversation.role !== "member";

                return (
                  // The row is a link with buttons *beside* it rather than
                  // inside it: a button is interactive content and an anchor
                  // may not contain any. So the link fills the row, the
                  // controls sit over its right end, and only one of them is
                  // ever under the pointer.
                  <li
                    key={conversation._id}
                    data-glide-row
                    className="relative"
                  >
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-2 py-2 transition-colors",
                        active && "bg-foreground/[0.06]",
                        // Room kept for the controls beside it, so the unread
                        // count has somewhere to sit that is not underneath
                        // them. Held rather than revealed on hover: this
                        // column is a page of its own on a phone, where there
                        // is no hover to reveal with.
                        group && (canInvite ? "pr-[4.5rem]" : "pr-11"),
                      )}
                    >
                      <Monogram
                        handle={
                          conversation.kind === "dm"
                            ? (conversation.peerHandle ?? name)
                            : name
                        }
                        imageUrl={conversation.peerAvatarUrl}
                        emoji={
                          conversation.kind === "dm"
                            ? conversation.peerAvatarEmoji
                            : conversation.emoji
                        }
                        initials={
                          conversation.kind === "dm"
                            ? conversation.peerAvatarInitials
                            : conversation.initials
                        }
                        hue={
                          conversation.kind === "dm"
                            ? conversation.peerAvatarHue
                            : conversation.hue
                        }
                        brand={conversation.kind === "global"}
                      />

                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-[0.9375rem]",
                            unread ? "font-semibold" : "font-medium",
                          )}
                        >
                          {name}
                        </span>
                        {/* Somebody in here said your name and you have not
                            seen it yet. That is the one thing about a
                            conversation worth saying in its subtitle, so it
                            takes the line over until the thread is read. */}
                        {conversation.mentioned ? (
                          <span className="flex items-center gap-1 truncate text-[0.75rem] font-medium text-primary">
                            <AtSymbolIcon
                              aria-hidden
                              className="size-3 shrink-0"
                              strokeWidth={2.25}
                            />
                            Mentioned you
                          </span>
                        ) : (
                          <span className="block truncate text-[0.75rem] text-faint">
                            {conversation.kind === "global"
                              ? "Everyone here"
                              : conversation.kind === "group"
                                ? "Group"
                                : `@${conversation.peerHandle ?? ""}`}
                          </span>
                        )}
                      </span>

                      {/* A count where a count means something, a dot where
                          it does not. See the note at the top of this file. */}
                      {unread ? (
                        conversation.unreadExact ? (
                          <CountBadge size="md">
                            {conversation.unread > 99
                              ? "99+"
                              : conversation.unread}
                          </CountBadge>
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
                <li data-glide-row>
                  <button
                    type="button"
                    onClick={() => field.current?.focus()}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left"
                  >
                    <span
                      aria-hidden
                      className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground"
                    >
                      <UserPlusIcon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9375rem] font-medium text-muted-foreground">
                        Message someone
                      </span>
                      <span className="block truncate text-[0.75rem] text-faint">
                        Search a handle, or press a name in the room
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
            </GlideList>

            {needle === "" ? null : (
              <div className="px-2">
                <People term={term} exclude={known} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
