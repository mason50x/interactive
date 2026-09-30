"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { ROLES } from "@config/roles";
import { readStorage, writeStorage } from "@/lib/storage";

type SiteRole = keyof typeof ROLES;

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
  live: SiteRole | undefined,
): SiteRole | null {
  const key = userId ? `il-staff-role:${userId}` : null;
  const getSnapshot = useCallback(() => {
    const value = key ? readStorage(key) : null;
    return value === "ceo" ||
      value === "co_owner" ||
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
