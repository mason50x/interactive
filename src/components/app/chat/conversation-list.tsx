"use client";

import { AtSymbolIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { NotificationControl } from "@/components/app/chat/notification-control";
import { useChat } from "@/components/app/chat/chat-provider";
import { GlideList } from "@/components/app/chat/glide-list";
import { Monogram } from "@/components/app/chat/monogram";
import { AccountDirectory } from "@/components/app/chat/account-directory";
import { conversationName } from "@/lib/chat";
import { CHAT_HREF } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useWarmRoutes } from "@/lib/warm";
import { CountBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** Conversations and people in the chat sidebar. */
export function ConversationList() {
  const { conversations } = useChat();
  const pathname = usePathname();
  const warm = useWarmRoutes(pathname);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const shown = useMemo(() => {
    return conversations.filter((conversation) => {
      if (filter === "unread" && conversation.unread === 0) return false;
      return true;
    });
  }, [conversations, filter]);

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

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="chat-list-filter sticky top-0 z-10 shrink-0 px-3 pt-3 pb-2">
          <div className="flex items-end justify-center gap-2">
            <div
              className="flex shrink-0 items-center gap-0.5"
              role="group"
              aria-label="Filter conversations"
            >
              {(["all", "unread"] as const).map((value) => (
                <Button
                  key={value}
                  size="xs"
                  variant={filter === value ? "secondary" : "ghost"}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {value === "all" ? "All" : "Unread"}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col pb-16">
          {/* One highlight glides between the rows rather than each row
                lighting up on its own — see `GlideList`. */}
          <GlideList listClassName="flex flex-col gap-0.5 px-2">
            {shown.map((conversation) => {
              const href = `${CHAT_HREF}/${conversation._id}`;
              const active = pathname === href;
              const name = conversationName(conversation);
              const unread = conversation.unread > 0;

              return (
                <li key={conversation._id} data-glide-row className="relative">
                  <Link
                    href={href}
                    {...warm(href)}
                    aria-current={active ? "page" : undefined}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors"
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
                      announcements={conversation.kind === "announcements"}
                      admins={conversation.kind === "admins"}
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
                      {conversation.mentioned ? (
                        <span className="flex items-center gap-1 truncate text-[0.75rem] font-medium text-primary">
                          <AtSymbolIcon
                            aria-hidden
                            className="size-3 shrink-0"
                            strokeWidth={2.25}
                          />
                          Mentioned you
                        </span>
                      ) : null}
                    </span>

                    {/* A count where a count means something, a dot where
                          it does not. See the note at the top of this file. */}
                    {unread ? (
                      conversation.kind === "announcements" ? (
                        <span
                          aria-label="New announcement"
                          className="flex shrink-0 items-center gap-1.5 text-red-500"
                        >
                          <span className="text-shimmer-periodic text-xs font-semibold [--shimmer-base:var(--color-red-500)]">
                            NEW!
                          </span>
                          <span
                            aria-hidden
                            className="size-2 rounded-full bg-current"
                          />
                        </span>
                      ) : conversation.unreadExact ? (
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
                </li>
              );
            })}

            {conversations.length === 0 ? (
              <li className="px-2 py-6 text-[0.875rem] leading-relaxed text-muted-foreground">
                Nothing yet. The room should be here in a moment.
              </li>
            ) : null}
            {conversations.length > 0 && shown.length === 0 ? (
              <li className="px-2 py-6 text-sm leading-relaxed text-muted-foreground">
                You’re all caught up.
              </li>
            ) : null}
          </GlideList>

          {filter === "all" ? <AccountDirectory exclude={known} /> : null}
        </div>
      </div>
      <NotificationControl />
    </div>
  );
}
