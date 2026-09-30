"use client";

import { useState } from "react";

import { api } from "@convex/_generated/api";
import { SegmentedControl } from "@/components/ui/segmented";
import { useAuthedQuery } from "@/lib/use-authed-query";
import { AnnouncementConfig } from "./announcement-config";
import { InviteCodes } from "./invite-codes";
import { UserDirectory } from "./user-directory";
import { Votes } from "./votes";

/** Head Moderators get the users and the announcement; CEOs get everything. */
const TABS = [
  { value: "users", label: "Users", ceoOnly: false },
  { value: "invites", label: "Invite codes", ceoOnly: true },
  { value: "votes", label: "Vote", ceoOnly: true },
  { value: "announcement", label: "Announcement", ceoOnly: false },
] as const;

export function AdminConsole() {
  const role = useAuthedQuery(api.timeouts.access, {});
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("users");
  if (role === undefined) return <p role="status">Checking access…</p>;
  if (!role)
    return <p>Admin access is restricted to CEOs and Head Moderators.</p>;
  const tabs = TABS.filter((entry) => role === "ceo" || !entry.ceoOnly);
  return (
    <>
      <SegmentedControl
        tone="neutral"
        aria-label="Admin section"
        className="mb-5"
        value={tab}
        onValueChange={setTab}
        options={tabs}
      />
      {tab === "users" ? (
        <UserDirectory role={role} />
      ) : tab === "invites" && role === "ceo" ? (
        <InviteCodes />
      ) : tab === "votes" && role === "ceo" ? (
        <Votes />
      ) : (
        <AnnouncementConfig />
      )}
    </>
  );
}
