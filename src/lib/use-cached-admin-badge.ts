"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { readStorage, writeStorage } from "@/lib/storage";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function serverSnapshot() {
  return null;
}

/** Cosmetic only. Permissions must always use the live server response. */
export function useCachedAdminBadge(
  userId: string | undefined,
  live:
    "ceo" | "head_moderator" | "moderator" | "builder" | "member" | undefined,
): "ceo" | "head_moderator" | "moderator" | "builder" | "member" | null {
  const key = userId ? `il-staff-role:${userId}` : null;
  const getSnapshot = useCallback(() => {
    const value = key ? readStorage(key) : null;
    return value === "ceo" ||
      value === "head_moderator" ||
      value === "moderator" ||
      value === "builder" ||
      value === "member"
      ? value
      : null;
  }, [key]);
  const cached = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);

  useEffect(() => {
    if (key && live !== undefined) writeStorage(key, String(live));
  }, [key, live]);

  return userId ? (live ?? cached) : null;
}
