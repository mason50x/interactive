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
  live: boolean | undefined,
): boolean | null {
  const key = userId ? `il-admin-badge:${userId}` : null;
  const getSnapshot = useCallback(() => {
    const value = key ? readStorage(key) : null;
    return value === "true" ? true : value === "false" ? false : null;
  }, [key]);
  const cached = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);

  useEffect(() => {
    if (key && live !== undefined) writeStorage(key, String(live));
  }, [key, live]);

  return userId ? live ?? cached : null;
}
