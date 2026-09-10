"use client";

import { useMutation, useQuery } from "convex/react";
import { Button } from "@/components/ui/button";
import { GlideList } from "@/components/app/chat/glide-list";
import { PersonRow, RowMenu } from "@/components/app/chat/people-rows";
import { Separator } from "@/components/ui/separator";
import { api } from "@convex/_generated/api";

/**
 * What is waiting on you, at the top of the conversation list.
 *
 * Friend requests and group invitations are the two things in chat that need
 * an answer, and they used to be behind a button in the header with a number
 * on it — which is the one place a new arrival has no reason to look. They sit
 * above the conversations now, where the next thing to read is, and they go
 * the moment they are answered.
 */
export function Waiting() {
  const pending = useQuery(api.chat.friends.pending, {});
  const invitations = useQuery(api.chat.groups.invitations, {});

  const accept = useMutation(api.chat.friends.accept);
  const remove = useMutation(api.chat.friends.remove);
  const block = useMutation(api.chat.blocks.block);
  const respond = useMutation(api.chat.groups.respondToInvite);

  const incoming = (pending ?? []).filter((row) => !row.outgoing);
  const invites = invitations ?? [];

  if (incoming.length === 0 && invites.length === 0) return null;

  return (
    <div className="px-2 pt-1 pb-2">
      <Separator>Waiting on you</Separator>
      <GlideList className="mt-1" listClassName="flex flex-col">
        {incoming.map((row) => (
          <PersonRow
            key={row.clerkId}
            person={row}
            detail="Wants to be friends"
          >
            {/* Turning a request down leaves them free to send another one,
                which is the right default and the wrong one for the person
                sending the fourth. */}
            <RowMenu
              label={`More for ${row.handle}`}
              items={[
                {
                  label: `Block ${row.handle}`,
                  onClick: () => void block({ peerClerkId: row.clerkId }),
                  danger: true,
                },
              ]}
            />
            <Button
              variant="ghost"
              size="xs"
              onClick={() => void remove({ peerClerkId: row.clerkId })}
            >
              No
            </Button>
            <Button
              size="xs"
              className="shadow-none hover:shadow-none"
              onClick={() => void accept({ peerClerkId: row.clerkId })}
            >
              Accept
            </Button>
          </PersonRow>
        ))}

        {invites.map((invitation) => (
          <PersonRow
            key={invitation.conversationId}
            card={false}
            person={{
              clerkId: invitation.conversationId,
              handle: invitation.title,
            }}
            detail={
              invitation.invitedBy === undefined
                ? "Group invitation"
                : `Group invitation from ${invitation.invitedBy}`
            }
          >
            <Button
              variant="ghost"
              size="xs"
              onClick={() =>
                void respond({
                  conversationId: invitation.conversationId,
                  accept: false,
                })
              }
            >
              No
            </Button>
            <Button
              size="xs"
              className="shadow-none hover:shadow-none"
              onClick={() =>
                void respond({
                  conversationId: invitation.conversationId,
                  accept: true,
                })
              }
            >
              Join
            </Button>
          </PersonRow>
        ))}
      </GlideList>
    </div>
  );
}
