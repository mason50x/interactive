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
 * so the chat's view of who you are is never a page load behind. Mounted by
 * `AppProviders`, so it is on every page of the app and none of `/learn`.
 */
export function StoreUser() {
  const { isAuthenticated } = useConvexAuth();
  const { user } = useUser();
  const sync = syncChatAccount;
  const updatedAt = user?.updatedAt?.getTime();
  useEffect(() => {
    if (!isAuthenticated) return;
    void sync().catch((error) => console.error("Account sync failed", error));
  }, [isAuthenticated, sync, updatedAt]);
  return null;
}
