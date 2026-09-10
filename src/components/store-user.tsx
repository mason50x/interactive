"use client";
import { useUser } from "@clerk/nextjs";
import { useConvexAuth } from "convex/react";
import { useEffect } from "react";
import { syncChatAccount } from "@/lib/account-actions";

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
