"use client";

import { api } from "@convex/_generated/api";
import { useAuthedQuery } from "@/lib/use-authed-query";
import { QuotaConsole } from "./quota-console";
import { TimeoutConsole } from "./timeout-console";

export function AdminConsole() {
  const role = useAuthedQuery(api.timeouts.access, {});
  if (role === undefined) return <p role="status">Checking access…</p>;
  if (!role)
    return <p>Admin access is restricted to CEOs and Head Moderators.</p>;
  return (
    <div className="space-y-6">
      <TimeoutConsole />
      {role === "ceo" && <QuotaConsole />}
    </div>
  );
}
