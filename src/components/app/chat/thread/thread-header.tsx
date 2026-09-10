"use client";

import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { GroupPanel } from "@/components/app/chat/group-panel";
import { Monogram } from "@/components/app/chat/monogram";
import { PersonCard } from "@/components/app/chat/person-card";
import { Present } from "@/components/app/chat/presence";
import { conversationName } from "@/lib/chat";
import { CHAT_HREF } from "@/lib/nav";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type { ConversationDetail } from "../../../../../convex/chat/conversations";
import type { Typist } from "../../../../../convex/chat/typing";

/**
 * The bar over a conversation: who it is with, who is here, and the way
 * back to the list on a screen too narrow to show both.
 *
 * Drawn from the thread's own detail query rather than one of its own, so
 * the header is on screen the moment the thread is and never a beat later.
 */
export function ThreadHeader({
  conversationId,
  detail,
  typists,
}: {
  conversationId: Id<"conversations">;
  /** `undefined` while the conversation is still on its way. */
  detail: ConversationDetail | undefined;
  /** Who else is writing in here, for a direct message's second line. */
  typists: Typist[];
}) {
  const name = detail === undefined ? "" : conversationName(detail);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
      {/* Below `md` the conversation list is not on screen, so this is the
          only way back to it. Above `md` it is already there in the left
          pane and a second one would be clutter. */}
      <Link
        href={CHAT_HREF}
        aria-label="All conversations"
        className="-ml-1.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground md:hidden"
      >
        <ChevronLeftIcon className="size-5" />
      </Link>

      {detail === undefined ? null : (
        <>
          {/* In a direct message the header is the other person, so it is
              their card's trigger — the same door their name is everywhere
              else. */}
          {detail.kind === "dm" && detail.peerClerkId !== undefined ? (
            <PersonCard
              person={{
                clerkId: detail.peerClerkId,
                handle: detail.peerHandle ?? name,
                displayName: detail.peerName,
                avatarUrl: detail.peerAvatarUrl,
                avatarHue: detail.peerAvatarHue,
                avatarEmoji: detail.peerAvatarEmoji,
                avatarInitials: detail.peerAvatarInitials,
              }}
              className="-ml-1.5 flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-1.5 py-1 text-left outline-none hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <Monogram
                handle={detail.peerHandle ?? name}
                imageUrl={detail.peerAvatarUrl}
                hue={detail.peerAvatarHue}
                emoji={detail.peerAvatarEmoji}
                initials={detail.peerAvatarInitials}
                className="size-7 text-[0.75rem]"
              />
              <span className="min-w-0 flex-1">
                <h1 className="truncate text-[0.9375rem] font-semibold">
                  {name}
                </h1>
                {/* The handle, or the fact that they are writing — the
                    one thing worth taking that line over for, and shown
                    up here as well as in the thread because the thread's
                    dots are below the fold for anybody reading back. */}
                {detail.peerName === undefined &&
                typists.length === 0 ? null : (
                  <span className="block truncate text-[0.75rem] text-faint">
                    {typists.length > 0 ? (
                      <span className="text-shimmer">typing…</span>
                    ) : (
                      `@${detail.peerHandle}`
                    )}
                  </span>
                )}
              </span>
            </PersonCard>
          ) : (
            <>
              <Monogram
                handle={name}
                emoji={detail.emoji}
                hue={detail.hue}
                brand={detail.kind === "global"}
                className="size-7 text-[0.75rem]"
              />
              <h1 className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold">
                {name}
              </h1>
            </>
          )}
          {/* Who is in here now, not who belongs here — and asked for in the
              room as well as in a group, which is where a live number is
              worth the most and where a count of members was never going to
              be possible. A direct message has nobody to count. */}
          {detail.kind === "dm" ? null : (
            <Present conversationId={conversationId} />
          )}

          {detail.kind === "group" ? (
            <GroupPanel conversationId={conversationId} />
          ) : null}
        </>
      )}
    </header>
  );
}
