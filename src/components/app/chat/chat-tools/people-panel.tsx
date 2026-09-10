"use client";

import { useClerk } from "@clerk/nextjs";
import { UserGroupIcon } from "@heroicons/react/24/solid";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Separator } from "@/components/ui/separator";
import { FaceEditor, type Face } from "@/components/app/chat/face-editor";
import { Group, PersonRow, RowMenu } from "@/components/app/chat/people-rows";
import { useChat } from "@/components/app/chat/chat-provider";
import { useHeld } from "@/lib/use-held";
import { api } from "@convex/_generated/api";
import { FieldError } from "@/components/ui/alert";

/**
 * You, your friends, and who you have shut out.
 *
 * There used to be two questions above the friends list — who may reach you,
 * with three answers, and whether search may find you, with two — and both
 * are gone because both now have one answer. Direct messages are friends
 * only, for everybody: a stranger who finds your handle cannot open a
 * conversation with you, only ask. See `openDm` in
 * `convex/chat/conversations.ts`. And everybody can be found by handle. A
 * control with one position is a sentence, so that is what is drawn: one
 * line under your own row saying how it works, and no switch to look for.
 *
 * ## Why the queries are held
 *
 * This panel is mounted for the rest of the session once it has been opened
 * — hidden rather than thrown away, so that what was typed into it survives
 * — and two of its queries were subscribed for that whole time. One of them
 * counts every conversation the account is in, and a membership row is
 * written every time its owner reads a message, so a panel nobody was
 * looking at was re-counting itself on every message anybody sent them.
 *
 * They are asked only while the panel is open now, and `useHeld` is the part
 * that makes that invisible: dropping a subscription drops its value, so
 * without it the second opening would draw an empty panel for the length of
 * a round trip before filling in with the same numbers it showed the first
 * time.
 */
export function PeoplePanel({ open }: { open: boolean }) {
  const blocked = useHeld(useQuery(api.chat.blocks.list, open ? {} : "skip"));
  const unblock = useMutation(api.chat.blocks.unblock);

  return (
    <div className="pt-3">
      <Separator>Me</Separator>
      <Me />

      <div className="mt-5 flex items-start gap-3 rounded-xl border border-border bg-foreground/[0.03] px-3 py-2.5">
        <UserGroupIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 text-[0.8125rem] leading-snug text-muted-foreground">
          Only friends can message you. Anyone can find you by handle and ask to
          be one.
        </p>
      </div>

      <Friends open={open} />

      {(blocked ?? []).length > 0 ? (
        <div className="mt-4">
          <Group label="Blocked">
            {(blocked ?? []).map((person) => (
              <PersonRow key={person.clerkId} person={person} card={false}>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => void unblock({ peerClerkId: person.clerkId })}
                >
                  Unblock
                </Button>
              </PersonRow>
            ))}
          </Group>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Who your friends are, and the requests you have out.
 *
 * A roster rather than a way in: pressing a friend opens their card, which is
 * where Message lives, and the menu on the row is for the two rare things.
 * Held while the panel is shut, the same way the blocked list is — see
 * `useHeld`.
 */
function Friends({ open }: { open: boolean }) {
  const friends = useHeld(useQuery(api.chat.friends.list, open ? {} : "skip"));
  const pending = useHeld(
    useQuery(api.chat.friends.pending, open ? {} : "skip"),
  );
  const remove = useMutation(api.chat.friends.remove);
  const block = useMutation(api.chat.blocks.block);

  const outgoing = (pending ?? []).filter((row) => row.outgoing);

  return (
    <div className="mt-4">
      <Group label="Friends">
        {(friends ?? []).map((friend) => (
          <PersonRow key={friend.clerkId} person={friend}>
            <RowMenu
              label={`More for ${friend.handle}`}
              items={[
                {
                  label: "Remove friend",
                  onClick: () => void remove({ peerClerkId: friend.clerkId }),
                },
                {
                  label: `Block ${friend.handle}`,
                  onClick: () => void block({ peerClerkId: friend.clerkId }),
                  danger: true,
                },
              ]}
            />
          </PersonRow>
        ))}
        {friends !== undefined && friends.length === 0 ? (
          <EmptyState as="li">
            No friends yet. Press a name anywhere to add one.
          </EmptyState>
        ) : null}
      </Group>

      {outgoing.length > 0 ? (
        <Group label="Asked">
          {outgoing.map((row) => (
            <PersonRow key={row.clerkId} person={row}>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => void remove({ peerClerkId: row.clerkId })}
              >
                Cancel
              </Button>
            </PersonRow>
          ))}
        </Group>
      ) : null}
    </div>
  );
}

/**
 * How many messages this account has ever sent, said in words.
 *
 * Grouped by locale, because the number is the point of the line and `1284` is
 * harder to read at a glance than `1,284`. Zero is not "0 messages sent": an
 * account that has never spoken is at the beginning of something rather than
 * holding a count of nothing.
 */
function sentLabel(sent: number): string {
  if (sent === 0) return "No messages yet";
  if (sent === 1) return "1 message sent";
  return `${sent.toLocaleString()} messages sent`;
}

/** Clerk controls identity; chat controls the avatar style. */
function Me() {
  const { profile } = useChat();
  const { openUserProfile } = useClerk();
  const setAvatar = useMutation(api.chat.profiles.setAvatar);
  const [error, setError] = useState<string | null>(null);
  const save = async (face: Face, mode: "account" | "custom") => {
    try {
      const result = await setAvatar({ ...face, mode });
      setError(result.ok ? null : "Could not save your picture. Try again.");
    } catch {
      setError("Could not save your picture. Try again.");
    }
  };
  return (
    <div className="mt-2">
      <FaceEditor
        name={profile?.handle ?? ""}
        label="your picture"
        face={{
          emoji: profile?.avatarEmoji,
          initials: profile?.avatarInitials,
          hue: profile?.avatarHue,
        }}
        imageUrl={profile?.avatarUrl}
        account={{
          selected: profile?.avatarMode !== "custom",
          onSelect: () => void save({}, "account"),
        }}
        onChange={(face) => void save(face, "custom")}
      >
        <div className="min-w-0">
          <p className="truncate text-[0.9375rem] font-semibold">
            {profile?.displayName || profile?.handle}
          </p>
          <p className="truncate text-[0.8125rem] text-muted-foreground">
            @{profile?.handle}
          </p>
          <p className="text-[0.75rem] text-faint">
            {sentLabel(profile?.messagesSent ?? 0)}
          </p>
        </div>
      </FaceEditor>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2"
        onClick={() => openUserProfile()}
      >
        Manage account
      </Button>
      <p className="mt-1 text-xs text-muted-foreground">
        Your name and handle come from your account.
      </p>
      {error && <FieldError className="text-xs">{error}</FieldError>}
    </div>
  );
}
