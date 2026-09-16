"use client";

import { useMutation, useQuery } from "convex/react";
import { Button } from "@/components/ui/button";
import { GlideList } from "@/components/app/chat/glide-list";
import { PersonRow } from "@/components/app/chat/people-rows";
import { Separator } from "@/components/ui/separator";
import { api } from "@convex/_generated/api";

export function Waiting() {
  const invitations = useQuery(api.chat.groups.invitations, {});

  const respond = useMutation(api.chat.groups.respondToInvite);

  const invites = invitations ?? [];

  if (invites.length === 0) return null;

  return (
    <div className="px-2 pt-1 pb-2">
      <Separator>Waiting on you</Separator>
      <GlideList className="mt-1" listClassName="flex flex-col">
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
