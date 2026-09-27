"use client";

import { useState } from "react";

import { api } from "@convex/_generated/api";
import { SegmentedControl } from "@/components/ui/segmented";
import { useAuthedQuery } from "@/lib/use-authed-query";
import { InviteCodes } from "./invite-codes";
import { UserDirectory } from "./user-directory";

const TABS = [
  { value: "users", label: "Users" },
  { value: "invites", label: "Invite codes" },
] as const;

export function AdminConsole() {
  const role = useAuthedQuery(api.timeouts.access, {});
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("users");
  if (role === undefined) return <p role="status">Checking access…</p>;
  if (!role)
    return <p>Admin access is restricted to CEOs and Head Moderators.</p>;
  if (role !== "ceo") return <UserDirectory role={role} />;
  return (
    <>
      <SegmentedControl
        tone="neutral"
        aria-label="Admin section"
        className="mb-5"
        value={tab}
        onValueChange={setTab}
        options={TABS}
      />
      {tab === "users" ? <UserDirectory role={role} /> : <InviteCodes />}
    </>
  );
}
