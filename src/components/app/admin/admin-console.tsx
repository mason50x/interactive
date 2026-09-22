"use client";

import { api } from "@convex/_generated/api";
import { useAuthedQuery } from "@/lib/use-authed-query";
import { UserDirectory } from "./user-directory";

export function AdminConsole() {
  const role = useAuthedQuery(api.timeouts.access, {});
  if (role === undefined) return <p role="status">Checking access…</p>;
  if (!role)
    return <p>Admin access is restricted to CEOs and Head Moderators.</p>;
  return <UserDirectory role={role} />;
}
