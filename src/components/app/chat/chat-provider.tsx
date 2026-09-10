"use client";

import { useMutation } from "convex/react";
import { createContext, use, useEffect, useRef, type ReactNode } from "react";
import { api } from "@convex/_generated/api";
import type { ConversationSummary } from "@convex/chat/conversations";
import type { MyProfile } from "@convex/chat/profiles";
import { useAuthedQuery } from "@/lib/use-authed-query";
import { useConvexAuth } from "convex/react";

/**
 * Everything about chat that something outside chat needs to know.
 *
 * Which is less than it sounds: the rail wants a dot, and the chat pages want
 * the conversation list and the caller's own profile without each of them
 * opening its own subscription to the same two queries. Mounted in the
 * dashboard layout rather than inside `/dashboard/chat`, because the dot has to
 * be right on the activities page too.
 *
 * The `isAuthenticated ? {} : "skip"` on every query is not defensive
 * boilerplate. A Convex query that runs before Clerk's token has reached the
 * server comes back `null`, which is the same value `profiles.mine` returns for
 * "this account has no handle" — so without the skip, every sign-in would flash
 * the handle screen at somebody who already has one. The invite card uses the same authentication guard.
 */

export type Chat = {
  /** `null` while unknown *or* when no handle has been claimed. */
  profile: MyProfile | null;
  /** True until the first answer arrives, which is not the same as no profile. */
  loading: boolean;
  conversations: ConversationSummary[];
  /** Unread messages in direct messages and groups. The room is not counted. */
  unread: number;
  /** Anything at all, the room's dot included. */
  hasUnread: boolean;
  /**
   * Whether something unread names the caller — by handle, or `@everyone`
   * in a group. The rail says "Mentioned" instead of "Unread" when it does.
   */
  mentioned: boolean;
  /** Friend requests waiting on you, plus group invitations. */
  waiting: number;
  /**
   * Whether pictures may be sent. Read off the deployment — see
   * `convex/features.ts` — and `false` until the answer arrives, so the
   * button is absent rather than briefly present on a deployment where it
   * is off.
   */
  images: boolean;
  isAdmin: boolean;
};

const EMPTY: Chat = {
  profile: null,
  loading: true,
  conversations: [],
  unread: 0,
  hasUnread: false,
  mentioned: false,
  waiting: 0,
  images: false,
  isAdmin: false,
};

const ChatContext = createContext<Chat>(EMPTY);

export function useChat() {
  return use(ChatContext);
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const profile = useAuthedQuery(api.chat.profiles.mine, {});
  const conversations = useAuthedQuery(api.chat.conversations.list, {});
  const pending = useAuthedQuery(api.chat.friends.pending, {});
  const invitations = useAuthedQuery(api.chat.groups.invitations, {});
  const isAdmin = useAuthedQuery(api.chat.admin.mine, {});
  const features = useAuthedQuery(api.features.get, {});

  // Puts the account back in the global room. Idempotent, and it exists for the
  // accounts that claimed a handle before the room did — and for anyone who
  // left it. Latched, because in StrictMode an effect runs twice and this is a
  // write.
  const joinGlobal = useMutation(api.chat.profiles.joinGlobal);
  const joined = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || joined.current) return;
    if (profile === undefined || profile === null) return;
    joined.current = true;
    void joinGlobal({});
  }, [isAuthenticated, profile, joinGlobal]);

  const list = conversations ?? [];

  // The room contributes a dot and never a number — see `unreadExact` in
  // `convex/chat/conversations.ts` for why counting it would be the one query
  // whose cost grows with how much the whole site is talking.
  const unread = list.reduce(
    (total, row) => (row.unreadExact ? total + row.unread : total),
    0,
  );
  const hasUnread = list.some((row) => row.unread > 0);
  const mentioned = list.some((row) => row.mentioned);

  const waiting =
    (pending ?? []).filter((request) => !request.outgoing).length +
    (invitations ?? []).length;

  const value: Chat = {
    profile: profile ?? null,
    loading: profile === undefined,
    conversations: list,
    unread,
    hasUnread,
    mentioned,
    waiting,
    images: features?.images ?? false,
    isAdmin: isAuthenticated && isAdmin === true,
  };

  return <ChatContext value={value}>{children}</ChatContext>;
}
