"use client";

import { BellIcon, BellSlashIcon } from "@heroicons/react/24/solid";
import { useChat } from "@/components/app/chat/chat-provider";
import { Button } from "@/components/ui/button";

export function NotificationControl() {
  const { notifications } = useChat();
  return (
    <div className="shrink-0 border-t border-border px-3 py-2">
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start"
        onClick={() => void notifications.toggle()}
        disabled={
          notifications.pending || notifications.permission === "unsupported"
        }
        aria-pressed={notifications.enabled}
      >
        {notifications.enabled ? <BellIcon /> : <BellSlashIcon />}
        {notifications.pending
          ? "Checking permission…"
          : notifications.enabled
            ? "Notifications on"
            : notifications.permission === "unsupported"
              ? "Notifications unavailable"
              : "Enable notifications"}
      </Button>
      {notifications.error ? (
        <p
          role="status"
          className="mt-1 px-2.5 text-xs leading-relaxed text-destructive"
        >
          {notifications.error}
        </p>
      ) : null}
    </div>
  );
}
