"use client";

import { useConvexAuth, useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";

/**
 * Writes the signed-in Clerk user into the Convex `users` table.
 *
 * The Clerk webhook (convex/http.ts) is the authoritative sync once it is
 * configured; this keeps the table correct from the very first sign-in and
 * covers local development before the webhook is pointed at the deployment.
 */
export function StoreUser() {
  const { isAuthenticated } = useConvexAuth();
  const storeUser = useMutation(api.users.store);

  useEffect(() => {
    if (!isAuthenticated) return;
    void storeUser();
  }, [isAuthenticated, storeUser]);

  return null;
}
