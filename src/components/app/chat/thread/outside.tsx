"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { FieldError } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Monogram } from "@/components/app/chat/monogram";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

/**
 * What a group looks like from outside it.
 *
 * The whole of group discovery, and it is a page rather than a directory on
 * purpose — there is no list of groups anywhere on this site. You are here
 * because somebody sent you this link, which means a person let you in rather
 * than a search box, and on a site whose users are thirteen that is the
 * difference worth keeping.
 *
 * An invitation-only group returns nothing at all from `preview`, so its link
 * lands on the same refusal as a made-up id. That is deliberate: a page that
 * says "this group exists but you may not see it" has told somebody something.
 */
export function Outside({
  conversationId,
}: {
  conversationId: Id<"conversations">;
}) {
  const preview = useQuery(api.chat.conversations.preview, { conversationId });
  const requestJoin = useMutation(api.chat.groups.requestJoin);
  const [notice, setNotice] = useState<string | null>(null);

  if (preview === undefined) {
    return (
      <div className="flex size-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (preview === null) {
    return (
      <div className="flex size-full items-center justify-center p-6 text-[0.9375rem] text-muted-foreground">
        This conversation is not open to you.
      </div>
    );
  }

  const open = preview.joinPolicy === "open";

  return (
    <div className="flex size-full items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <Monogram
          handle={preview.title}
          className="mx-auto size-12 text-[1.125rem]"
        />

        <h1 className="text-display mt-4 text-[1.5rem]">{preview.title}</h1>
        <p className="mt-1 text-[0.875rem] text-muted-foreground">
          {preview.members} {preview.members === 1 ? "person" : "people"} in
          here
        </p>

        {preview.requested ? (
          <p className="mt-5 text-[0.9375rem] text-muted-foreground">
            You have asked to join. Somebody in there has to say yes.
          </p>
        ) : (
          <Button
            className="mt-5 w-full"
            onClick={async () => {
              const result = await requestJoin({ conversationId });
              if (!result.ok) {
                setNotice(
                  result.reason === "full"
                    ? "This group is full."
                    : result.reason === "not-allowed"
                      ? "This group is invitation only."
                      : "That did not work.",
                );
              }
            }}
          >
            {open ? "Join" : "Ask to join"}
          </Button>
        )}

        {notice === null ? null : <FieldError>{notice}</FieldError>}
      </div>
    </div>
  );
}
