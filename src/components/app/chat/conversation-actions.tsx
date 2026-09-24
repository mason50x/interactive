"use client";

import {
  EllipsisHorizontalIcon,
  EnvelopeIcon,
  EnvelopeOpenIcon,
  StarIcon,
} from "@heroicons/react/24/outline";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useChat } from "@/components/app/chat/chat-provider";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { conversationName } from "@/lib/chat";
import { CHAT_HREF } from "@/lib/nav";
import { api } from "@convex/_generated/api";
import type { ConversationSummary } from "@convex/chat/conversations";

export function ConversationActions({
  conversation,
  active,
  onError,
}: {
  conversation: ConversationSummary;
  active: boolean;
  onError: (error: string | null) => void;
}) {
  const router = useRouter();
  const { suspendReading, clearReadSuppression, serverConversations } =
    useChat();
  const raw =
    serverConversations.find((row) => row._id === conversation._id) ??
    conversation;
  const setFavorite = useMutation(api.chat.conversations.setFavorite);
  const markUnread = useMutation(
    api.chat.conversations.markUnread,
  ).withOptimisticUpdate((store, { conversationId }) => {
    const rows = store.getQuery(api.chat.conversations.list, {});
    if (rows === undefined) return;
    const row = rows.find((item) => item._id === conversationId);
    const position = store.getQuery(api.chat.conversations.readPosition, {
      conversationId,
    });
    if (row?.latestMessage && position) {
      store.setQuery(
        api.chat.conversations.readPosition,
        { conversationId },
        {
          lastReadAt: Math.min(
            position.lastReadAt,
            row.latestMessage._creationTime - 0.001,
          ),
          firstUnreadId: position.firstUnreadId ?? row.latestMessage._id,
          firstUnreadAt:
            position.firstUnreadAt ?? row.latestMessage._creationTime,
        },
      );
    }
    store.setQuery(
      api.chat.conversations.list,
      {},
      rows.map((row) => {
        if (row._id !== conversationId || !row.latestMessage) return row;
        return {
          ...row,
          unread: Math.max(1, row.unread),
          firstUnreadMessageId:
            row.firstUnreadMessageId ?? row.latestMessage._id,
          lastReadAt: Math.min(
            row.lastReadAt,
            row.latestMessage._creationTime - 0.001,
          ),
        };
      }),
    );
  });
  const markRead = useMutation(
    api.chat.conversations.markRead,
  ).withOptimisticUpdate((store, { conversationId }) => {
    const rows = store.getQuery(api.chat.conversations.list, {});
    if (rows === undefined) return;
    const row = rows.find((item) => item._id === conversationId);
    const position = store.getQuery(api.chat.conversations.readPosition, {
      conversationId,
    });
    if (position) {
      store.setQuery(
        api.chat.conversations.readPosition,
        { conversationId },
        {
          lastReadAt: Math.max(
            position.lastReadAt,
            row?.latestMessage?._creationTime ?? 0,
          ),
          firstUnreadId: null,
          firstUnreadAt: null,
        },
      );
    }
    store.setQuery(
      api.chat.conversations.list,
      {},
      rows.map((row) =>
        row._id === conversationId
          ? {
              ...row,
              unread: 0,
              mentioned: false,
              firstUnreadMessageId: undefined,
              lastReadAt: Math.max(
                row.lastReadAt,
                row.latestMessage?._creationTime ?? 0,
              ),
            }
          : row,
      ),
    );
  });
  const [pending, setPending] = useState(false);

  async function run(action: "favorite" | "unread" | "read") {
    if (pending) return;
    setPending(true);
    onError(null);
    try {
      if (action === "favorite") {
        const changed = await setFavorite({
          conversationId: conversation._id,
          favorite: !conversation.favorite,
        });
        if (!changed) onError("This conversation is no longer available.");
      } else if (action === "read") {
        await markRead({ conversationId: conversation._id });
      } else {
        // Stop the live reader before writing the earlier cursor. Otherwise
        // the thread immediately marks the manually unread message read.
        if (active) {
          suspendReading(conversation._id);
        }
        const changed = await markUnread({ conversationId: conversation._id });
        if (!changed) {
          clearReadSuppression(conversation._id);
          onError("There are no messages to mark unread.");
        } else if (active) {
          router.push(`${CHAT_HREF}?inbox=1`);
        }
      }
    } catch {
      if (action === "unread") clearReadSuppression(conversation._id);
      onError("That change could not be saved. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="absolute inset-y-0 right-2 flex items-center">
        <Menu>
          <MenuTrigger
            aria-label={`Options for ${conversationName(conversation)}`}
            disabled={pending}
            className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-foreground/[0.08] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <EllipsisHorizontalIcon className="size-4" />
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem onClick={() => void run("favorite")}>
              <StarIcon className="size-4" />
              {conversation.favorite
                ? "Remove from favorites"
                : "Add to favorites"}
            </MenuItem>
            <MenuItem
              onClick={() => void run(raw.unread > 0 ? "read" : "unread")}
            >
              {raw.unread > 0 ? (
                <EnvelopeOpenIcon className="size-4" />
              ) : (
                <EnvelopeIcon className="size-4" />
              )}
              {raw.unread > 0 ? "Mark as read" : "Mark as unread"}
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </>
  );
}
