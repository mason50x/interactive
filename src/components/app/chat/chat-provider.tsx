"use client";

import { useMutation } from "convex/react";
import { usePathname } from "next/navigation";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ConversationSummary } from "@convex/chat/conversations";
import type { MyAccount } from "@convex/chat/accounts";
import { useAuthedQuery } from "@/lib/use-authed-query";
import { useConvexAuth } from "convex/react";
import { CHAT_HREF } from "@/lib/nav";
import { setTabUnread } from "@/lib/tab-mask";
import {
  useBrowserNotifications,
  type ChatNotifications,
} from "@/components/app/chat/use-browser-notifications";

export type Chat = {
  /** `null` while unknown *or* when no handle has been claimed. */
  profile: MyAccount | null;
  /** True until the first answer arrives, which is not the same as no profile. */
  loading: boolean;
  conversations: ConversationSummary[];
  /** The current server result, including pending optimistic cursor updates. */
  serverConversations: ConversationSummary[];
  /** Unread messages in direct messages. The room is not counted. */
  unread: number;
  /** Anything at all, the room's dot included. */
  hasUnread: boolean;
  /**
   * Whether something unread names the caller — by handle, or `@everyone`
   * in the Everyone room. The rail says "Mentioned" instead of "Unread"
   * when it does.
   */
  mentioned: boolean;

  /**
   * Whether pictures may be sent. Read off the deployment — see
   * `convex/features.ts` — and `false` until the answer arrives, so the
   * button is absent rather than briefly present on a deployment where it
   * is off.
   */
  images: boolean;
  isAdmin: boolean;
  staffRoles: {
    clerkId: string;
    role: "ceo" | "head_moderator" | "moderator" | "builder";
    /** Presentation only: the badge is hidden, the role's powers are not. */
    hideBadge?: true;
  }[];
  adminBadgesLoaded: boolean;
  /**
   * The conversation whose thread is open and visible, or `null`. Set by
   * `Thread` and used to decide when its reading position can advance.
   */
  reading: Id<"conversations"> | null;
  setReading: Dispatch<SetStateAction<Id<"conversations"> | null>>;
  /**
   * Whether the server still has something unread in `reading` — or has not
   * answered about it yet, which the thread treats the same way.
   */
  behind: boolean;
  notifications: ChatNotifications;
};

const EMPTY: Chat = {
  profile: null,
  loading: true,
  conversations: [],
  serverConversations: [],
  unread: 0,
  hasUnread: false,
  mentioned: false,
  images: false,
  isAdmin: false,
  staffRoles: [],
  adminBadgesLoaded: false,
  reading: null,
  setReading: () => {},
  behind: false,
  notifications: {
    enabled: false,
    permission: "unsupported",
    pending: false,
    error: null,
    toggle: async () => {},
  },
};

const ChatContext = createContext<Chat>(EMPTY);

export function useChat() {
  return use(ChatContext);
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated } = useConvexAuth();
  const profile = useAuthedQuery(api.chat.accounts.mine, {});
  const conversations = useAuthedQuery(api.chat.conversations.list, {});
  const staffRoles = useAuthedQuery(api.chat.admin.roles, {});
  const isAdmin = useAuthedQuery(api.chat.admin.mine, {});
  const features = useAuthedQuery(api.features.get, {});

  // Puts the account back in the global room. Idempotent, and it exists for the
  // accounts that claimed a handle before the room did — and for anyone who
  // left it. Latched, because in StrictMode an effect runs twice and this is a
  // write.
  const joinGlobal = useMutation(api.chat.accounts.joinGlobal);
  const joined = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || joined.current) return;
    if (profile === undefined || profile === null) return;
    joined.current = true;
    void joinGlobal({});
  }, [isAuthenticated, profile, joinGlobal]);

  const [registeredReading, setRegisteredReading] =
    useState<Id<"conversations"> | null>(null);
  const setReading = useCallback<
    Dispatch<SetStateAction<Id<"conversations"> | null>>
  >((next) => setRegisteredReading(next), []);
  const reading =
    registeredReading !== null &&
    pathname === `${CHAT_HREF}/${registeredReading}`
      ? registeredReading
      : null;

  // The cursor is authoritative, including optimistic writes.
  const served = conversations ?? [];
  const notifications = useBrowserNotifications({
    accountId: isAuthenticated ? profile?.clerkId : undefined,
    conversations: served,
    loaded: conversations !== undefined,
    reading,
  });
  const open =
    reading === null ? undefined : served.find((row) => row._id === reading);
  const behind = reading !== null && (open === undefined || open.unread > 0);
  const list = served;

  // The room contributes a dot and never a number — see `unreadExact` in
  // `convex/chat/conversations.ts` for why counting it would be the one query
  // whose cost grows with how much the whole site is talking.
  const unread = list.reduce(
    (total, row) => (row.unreadExact ? total + row.unread : total),
    0,
  );
  const hasUnread = list.some((row) => row.unread > 0);
  const mentioned = list.some((row) => row.mentioned);

  useEffect(() => {
    setTabUnread(isAuthenticated && hasUnread);
    return () => setTabUnread(false);
  }, [isAuthenticated, hasUnread]);

  const value: Chat = {
    profile: profile ?? null,
    loading: profile === undefined,
    conversations: list,
    serverConversations: served,
    unread,
    hasUnread,
    mentioned,
    images: features?.images ?? false,
    isAdmin: isAuthenticated && isAdmin === true,
    staffRoles: isAuthenticated ? (staffRoles ?? []) : [],
    adminBadgesLoaded: isAuthenticated && staffRoles !== undefined,
    reading,
    setReading,
    behind,
    notifications,
  };

  return <ChatContext value={value}>{children}</ChatContext>;
}
