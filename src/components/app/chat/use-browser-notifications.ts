"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { conversationName } from "@/lib/chat";
import { shouldNotifyMessage } from "@/lib/chat-notifications";
import { CHAT_HREF } from "@/lib/nav";
import type { ConversationSummary } from "@convex/chat/conversations";

const CHANGE_EVENT = "50x:chat-notifications";
const preferenceKey = (accountId: string) =>
  `50x:chat-notifications:${accountId}`;

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("focus", listener);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("focus", listener);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

function savedPreference(accountId: string | undefined): boolean {
  if (!accountId) return false;
  try {
    return localStorage.getItem(preferenceKey(accountId)) === "on";
  } catch {
    return false;
  }
}

function browserPermission(): NotificationPermission | "unsupported" {
  return typeof window !== "undefined" &&
    window.isSecureContext &&
    "Notification" in window
    ? Notification.permission
    : "unsupported";
}

export type ChatNotifications = {
  enabled: boolean;
  permission: NotificationPermission | "unsupported";
  pending: boolean;
  error: string | null;
  toggle: () => Promise<void>;
};

export function useBrowserNotifications({
  accountId,
  conversations,
  loaded,
  reading,
}: {
  accountId: string | undefined;
  conversations: ConversationSummary[];
  loaded: boolean;
  reading: string | null;
}): ChatNotifications {
  const pathname = usePathname();
  const router = useRouter();
  const permission = useSyncExternalStore(
    subscribe,
    browserPermission,
    () => "unsupported" as const,
  );
  const getPreference = useCallback(
    () => savedPreference(accountId),
    [accountId],
  );
  const enabled = useSyncExternalStore(subscribe, getPreference, () => false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = useRef<{
    accountId?: string;
    startedAt: number;
    seen: Map<string, { id: string; at: number }>;
  }>({ startedAt: 0, seen: new Map() });
  const displayed = useRef(new Set<Notification>());

  const toggle = useCallback(async () => {
    if (!accountId || pending) return;
    setError(null);
    if (browserPermission() === "unsupported") {
      setError("This browser does not support desktop notifications here.");
      return;
    }
    setPending(true);
    try {
      let nextEnabled = !(enabled && Notification.permission === "granted");
      if (nextEnabled) {
        // Permission is requested only as a direct result of pressing the button.
        const result =
          Notification.permission === "default"
            ? await Notification.requestPermission()
            : Notification.permission;
        nextEnabled = result === "granted";
        if (result === "denied")
          setError(
            "Notifications are blocked. Allow them in your browser’s site settings to enable alerts.",
          );
        else if (result !== "granted")
          setError(
            "Notifications were not enabled. You can try again whenever you like.",
          );
      }
      localStorage.setItem(
        preferenceKey(accountId),
        nextEnabled ? "on" : "off",
      );
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      setError(
        "Notifications could not be enabled. Check your browser’s notification and storage settings.",
      );
    } finally {
      setPending(false);
      window.dispatchEvent(new Event(CHANGE_EVENT));
    }
  }, [accountId, enabled, pending]);

  useEffect(() => {
    const notifications = displayed.current;
    return () => {
      for (const notification of notifications) notification.close();
      notifications.clear();
    };
  }, [accountId]);

  useEffect(() => {
    if (!accountId) {
      state.current = { startedAt: 0, seen: new Map() };
      return;
    }
    if (!loaded) return;
    const initialSnapshot = state.current.accountId !== accountId;
    if (initialSnapshot)
      state.current = { accountId, startedAt: Date.now(), seen: new Map() };
    const seen = state.current.seen;
    for (const conversation of conversations) {
      const message = conversation.latestMessage;
      if (!message) continue;
      const current = {
        id: message._id,
        at: message._creationTime,
        authorId: message.authorClerkId,
      };
      const previous = seen.get(conversation._id);
      // Seed the initial snapshot even when alerts are disabled: enabling them
      // never produces a burst of old messages, and reconnects do not replay it.
      if (!previous || current.at > previous.at)
        seen.set(conversation._id, current);
      if (
        initialSnapshot ||
        !enabled ||
        permission !== "granted" ||
        !shouldNotifyMessage({
          previous: previous ?? { id: "", at: state.current.startedAt },
          current,
          accountId,
          unread: conversation.unread,
          visibleConversation:
            reading === conversation._id &&
            document.visibilityState === "visible" &&
            document.hasFocus() &&
            pathname === `${CHAT_HREF}/${conversation._id}`,
        })
      )
        continue;

      const deliver = () => {
        if (
          state.current.accountId !== accountId ||
          !savedPreference(accountId) ||
          browserPermission() !== "granted"
        )
          return;
        const key = `${preferenceKey(accountId)}:last:${conversation._id}`;
        try {
          // Shared storage plus a Web Lock makes multiple open tabs one source
          // of alerts. The notification tag also replaces duplicate OS cards.
          const last = Number(localStorage.getItem(key) ?? 0);
          if (last >= message._creationTime) return;
          const notification = new Notification(
            `${message.authorHandle} · ${conversationName(conversation)}`,
            {
              body: message.body || "Sent a picture",
              tag: `chat:${accountId}:${message._id}`,
            },
          );
          localStorage.setItem(key, String(message._creationTime));
          displayed.current.add(notification);
          notification.onclose = () => displayed.current.delete(notification);
          notification.onclick = () => {
            window.focus();
            router.push(
              `${CHAT_HREF}/${conversation._id}?message=${message._id}`,
            );
            notification.close();
          };
        } catch {
          // Some mobile browsers expose Notification but require a service
          // worker. Preserve chat and explain the limitation in the control.
          setError(
            "Desktop alerts are unavailable in this browser. Try a desktop browser with notifications allowed.",
          );
        }
      };
      if (navigator.locks) {
        void navigator.locks
          .request(`chat-notification:${accountId}`, deliver)
          .catch(() => deliver());
      } else deliver();
    }
  }, [
    accountId,
    conversations,
    enabled,
    loaded,
    pathname,
    permission,
    reading,
    router,
  ]);

  return {
    enabled: enabled && permission === "granted",
    permission,
    pending,
    error,
    toggle,
  };
}
