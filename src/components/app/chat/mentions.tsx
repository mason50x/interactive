"use client";

import { Fragment, useMemo } from "react";
import { PersonCard } from "@/components/app/chat/person-card";
import { isBot } from "@/lib/chat";
import { EVERYONE, segmentMentions } from "@/lib/mentions";
import { cn } from "@/lib/utils";
import type { ChatMention } from "@convex/chat/messages";

/**
 * Naming somebody in a message, on screen.
 *
 * Three pieces, and they agree on one thing: what a `@word` looks like once
 * it is a person. `MentionText`, here, draws the chips in a message that has
 * been sent, and under the composer's textarea while one is being typed;
 * `useMentionPeople` (`mentions/use-mention-people.ts`) is who the composer
 * offers when `@` is pressed; `MentionPicker` (`mentions/mention-picker.tsx`)
 * is the list they are offered in. The types they share are declared here.
 *
 * ## Who is offered
 *
 * Whoever has spoken in the part of the thread that is loaded, first —
 * people who just said something are who a reply is nearly always to. Then
 * the people of the place: a group's members, a direct message's other
 * person, and in the room — which has no member list, by design, see
 * `members` in `convex/chat/conversations.ts` — the caller's friends and,
 * from the second character, whoever the handle index finds. The server
 * checks all of it again on send: offering somebody is not the same as being
 * allowed to name them, and `resolveMentions` in `convex/chat/messages.ts`
 * is where that is settled.
 *
 * The member list is asked for only while the picker is open. It is the one
 * query in chat that subscribes to every membership row in a group — rows
 * that are written by every reader on every message — and the thread was
 * built specifically not to hold that subscription. Opening the picker holds
 * it for as long as the `@` is under the caret, which is seconds.
 *
 * Everybody ever offered is remembered for the life of the composer, so a
 * chip in the box keeps its colour after the picker has closed and its
 * queries have gone quiet.
 */

export type MentionPerson = {
  clerkId: string;
  handle: string;
  displayName?: string;
  avatarHue?: number;
  avatarEmoji?: string;
  avatarInitials?: string;
  avatarUrl?: string;
};

/** One row of the picker. */
export type MentionCandidate =
  { kind: "person"; person: MentionPerson } | { kind: "everyone" };

/**
 * A body with its mentions drawn as chips.
 *
 * `resolve` is the one thing the two callers differ on. A sent message
 * answers from the `mentions` the server stored on it; the composer answers
 * from the people it has offered. Both draw exactly the `@words` the answer
 * recognises and leave every other `@word` as the text it is.
 *
 * A chip for a person opens their card, the same door their name is
 * everywhere else — except a chip for the reader, and `@everyone`, which are
 * nobody to open a card about. `plain` draws no cards at all, which is what
 * the layer under the textarea wants: it is behind the field, it takes no
 * pointer, and a button there would be a button nobody could press.
 */
export function MentionText({
  body,
  resolve,
  me,
  mine = false,
  plain = false,
}: {
  body: string;
  resolve: (handle: string) => string | null | undefined;
  /** The reader, so a mention of them is drawn a shade stronger. */
  me: string | null | undefined;
  /** Inside the reader's own bubble, which is white on the accent. */
  mine?: boolean;
  plain?: boolean;
}) {
  const segments = useMemo(
    () => segmentMentions(body, resolve),
    [body, resolve],
  );

  return segments.map((segment, index) => {
    if (segment.kind === "text") {
      return <Fragment key={index}>{segment.text}</Fragment>;
    }
    const named = segment.clerkId === undefined || segment.clerkId === me;
    const chip = cn(
      "mention-chip",
      mine ? "mention-chip-mine" : named && "mention-chip-me",
    );
    if (
      plain ||
      named ||
      segment.clerkId === undefined ||
      isBot(segment.clerkId)
    ) {
      return (
        <span
          key={index}
          className={chip}
          title={
            segment.clerkId === undefined
              ? "Everyone in this group"
              : isBot(segment.clerkId)
                ? "Room bot"
                : undefined
          }
        >
          {segment.text}
        </span>
      );
    }
    return (
      <PersonCard
        key={index}
        person={{ clerkId: segment.clerkId, handle: segment.handle }}
        className={cn(
          chip,
          "cursor-pointer outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60",
        )}
      >
        {segment.text}
      </PersonCard>
    );
  });
}

/**
 * The answer a sent message gives `MentionText`: the people the server stored
 * on it, and `@everyone` when it said so.
 */
export function resolverFor(
  mentions: ChatMention[],
  everyone: boolean,
): (handle: string) => string | null | undefined {
  return (handle) => {
    if (handle === EVERYONE) return everyone ? null : undefined;
    return mentions.find((mention) => mention.handle === handle)?.clerkId;
  };
}
