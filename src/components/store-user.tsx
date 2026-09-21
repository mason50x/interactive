"use client";

import { useUser } from "@clerk/nextjs";
import { useConvexAuth } from "convex/react";
import { useEffect } from "react";
import { syncChatAccount } from "@/lib/account-actions";

/**
 * Keeps the account's row on the server current with Clerk.
 *
 * Renders nothing. It runs the sync once the session has reached Convex, and
 * again whenever Clerk reports the profile changed — a new name or avatar —
 * and retries temporary failures without waiting for a visit to Chat. Mounted by
 * `AppProviders`, so it is on every page of the app and none of `/learn`.
 */
export function StoreUser() {
  const { isAuthenticated } = useConvexAuth();
  const { isLoaded, user } = useUser();
  const userId = user?.id;
  const username = user?.username;
  const updatedAt = user?.updatedAt?.getTime();
  useEffect(() => {
    if (!isAuthenticated || !isLoaded || !userId || !username) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 1000;

    async function sync() {
      try {
        await syncChatAccount();
      } catch (error) {
        if (!active) return;
        console.error("Account sync failed; retrying automatically", error);
        retry = setTimeout(() => void sync(), retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30_000);
      }
    }

    void sync();
    return () => {
      active = false;
      clearTimeout(retry);
    };
  }, [isAuthenticated, isLoaded, userId, username, updatedAt]);
  return null;
}
