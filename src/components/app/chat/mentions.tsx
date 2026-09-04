"use client";

import { useQuery } from "convex/react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { Monogram } from "@/components/app/chat/monogram";
import { PersonCard } from "@/components/app/chat/person-card";
import { personName } from "@/lib/chat";
import { EVERYONE, segmentMentions } from "@/lib/mentions";
import { cn } from "@/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { ChatMention } from "../../../../convex/chat/messages";

/**
 * Naming somebody in a message, on screen.
 *
 * Three pieces, and they are together because they agree on one thing: what
 * a `@word` looks like once it is a person. `MentionText` draws the chips in
 * a message that has been sent, and under the composer's textarea while one
 * is being typed; `useMentionPeople` is who the composer offers when `@` is
 * pressed; `MentionPicker` is the list they are offered in.
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
};

/** One row of the picker. */
export type MentionCandidate =
  | { kind: "person"; person: MentionPerson }
  | { kind: "everyone" };

/** The most rows the picker shows. Past this, type another letter. */
const MAX_SHOWN = 6;

/** How long typing settles before the handle index is asked. */
const SEARCH_DEBOUNCE_MS = 200;

/**
 * How well a person matches what has been typed, lower being better, or
 * `null` for not at all. Handle first, because the handle is what was being
 * typed after an `@`; then a display name, which is what somebody remembers.
 */
function rankOf(person: MentionPerson, query: string): number | null {
  if (query === "") return 0;
  const name = (person.displayName ?? "").toLowerCase();
  if (person.handle.startsWith(query)) return 0;
  if (name.startsWith(query)) return 1;
  if (person.handle.includes(query) || name.includes(query)) return 2;
  return null;
}

export function useMentionPeople({
  conversationId,
  kind,
  peer,
  authors,
  me,
  open,
  query,
}: {
  conversationId: Id<"conversations">;
  /** `null` until the conversation has answered about itself. */
  kind: "global" | "dm" | "group" | null;
  /** A direct message's other person. */
  peer: MentionPerson | null;
  /** Whoever has spoken in the loaded thread, newest first. */
  authors: MentionPerson[];
  me: string | null | undefined;
  /** Whether the picker is up, which is when the queries below run. */
  open: boolean;
  /** What has been typed after the `@`, lowercased. */
  query: string;
}): {
  candidates: MentionCandidate[];
  /** Everybody ever offered, by handle. What the box's chips are drawn from. */
  known: ReadonlyMap<string, MentionPerson>;
  loading: boolean;
} {
  const group = open && kind === "group";
  const global = open && kind === "global";

  const members = useQuery(
    api.chat.conversations.members,
    group ? { conversationId } : "skip",
  );
  const friends = useQuery(api.chat.friends.list, global ? {} : "skip");

  // The index is asked once typing has paused, and only in the room: a group
  // has its members and a direct message has its one person, and neither
  // wants strangers offered.
  const [term, setTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setTerm(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);
  const searching = global && term.length >= 2;
  const found = useQuery(
    api.chat.profiles.search,
    searching ? { term } : "skip",
  );

  const people = useMemo(() => {
    const seen = new Set<string>();
    const list: MentionPerson[] = [];
    const add = (person: MentionPerson) => {
      if (person.clerkId === me || seen.has(person.clerkId)) return;
      seen.add(person.clerkId);
      list.push(person);
    };
    for (const author of authors) add(author);
    if (peer !== null) add(peer);
    for (const member of members ?? []) {
      if (member.status !== "active") continue;
      add({
        clerkId: member.clerkId,
        handle: member.handle,
        displayName: member.displayName,
      });
    }
    for (const friend of friends ?? []) add(friend);
    for (const person of found ?? []) add(person);
    return list;
  }, [authors, peer, members, friends, found, me]);

  // Remembered across the picker closing. Set during render, which is the
  // sanctioned shape for state that mirrors other state — see `ghost` in the
  // composer for the same move.
  const [known, setKnown] = useState<Map<string, MentionPerson>>(
    () => new Map(),
  );
  const unseen = people.filter((person) => !known.has(person.handle));
  if (unseen.length > 0) {
    const next = new Map(known);
    for (const person of unseen) next.set(person.handle, person);
    setKnown(next);
  }

  const candidates = useMemo(() => {
    const ranked = people
      .map((person, index) => ({ person, index, rank: rankOf(person, query) }))
      .filter((entry): entry is typeof entry & { rank: number } =>
        entry.rank !== null,
      )
      .sort((first, second) =>
        first.rank !== second.rank
          ? first.rank - second.rank
          : first.index - second.index,
      );

    const everyone = kind === "group" && EVERYONE.startsWith(query);
    const room = everyone ? MAX_SHOWN - 1 : MAX_SHOWN;
    const list: MentionCandidate[] = ranked
      .slice(0, room)
      .map((entry) => ({ kind: "person", person: entry.person }));
    if (everyone) list.push({ kind: "everyone" });
    return list;
  }, [people, query, kind]);

  const loading =
    (group && members === undefined) ||
    (global &&
      (friends === undefined ||
        (query.length >= 2 && (term !== query || found === undefined))));

  return { candidates, known, loading };
}

/**
 * The list under the caret.
 *
 * Above the box, because the box is at the foot of the pane and there is
 * nowhere else. Rows are pressed with the mouse held down rather than on
 * click — `onMouseDown` with the default prevented — so the textarea never
 * loses focus on the way: a picker that blurs the field it is completing
 * closes itself before the pick lands.
 *
 * Keyboard handling is the composer's, which owns the field the keys arrive
 * in; this draws the row it is told is active and says which one was pressed.
 */
export function MentionPicker({
  id,
  candidates,
  active,
  loading,
  query,
  onActiveChange,
  onPick,
}: {
  id: string;
  candidates: MentionCandidate[];
  active: number;
  loading: boolean;
  query: string;
  onActiveChange: (index: number) => void;
  onPick: (candidate: MentionCandidate) => void;
}) {
  return (
    <div
      id={id}
      role="listbox"
      aria-label="People to mention"
      className="animate-notice-in absolute bottom-full left-0 z-30 mb-2 flex w-72 max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg shadow-black/[0.08]"
    >
      {candidates.map((candidate, index) => {
        const current = index === active;
        return (
          <button
            key={candidate.kind === "everyone" ? "@everyone" : candidate.person.clerkId}
            type="button"
            role="option"
            id={optionId(id, index)}
            aria-selected={current}
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => {
              if (!current) onActiveChange(index);
            }}
            onClick={() => onPick(candidate)}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none",
              current && "bg-foreground/[0.06]",
            )}
          >
            {candidate.kind === "everyone" ? (
              <>
                <span
                  aria-hidden
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[0.875rem] font-semibold text-primary"
                >
                  @
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.875rem] font-medium">
                    Everyone
                  </span>
                  <span className="block truncate text-[0.75rem] text-faint">
                    Notify everyone in this group
                  </span>
                </span>
              </>
            ) : (
              <>
                <Monogram
                  handle={candidate.person.handle}
                  hue={candidate.person.avatarHue}
                  emoji={candidate.person.avatarEmoji}
                  initials={candidate.person.avatarInitials}
                  className="size-7 text-[0.6875rem]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.875rem] font-medium">
                    {personName(candidate.person)}
                  </span>
                  <span className="block truncate text-[0.75rem] text-faint">
                    @{candidate.person.handle}
                  </span>
                </span>
              </>
            )}
          </button>
        );
      })}

      {candidates.length === 0 ? (
        loading ? (
          <div
            role="status"
            className="flex items-center justify-center gap-2 py-3"
          >
            <Spinner aria-hidden className="size-3.5 text-faint" />
            <span className="text-shimmer text-[0.8125rem]">Searching</span>
          </div>
        ) : (
          <p className="px-2 py-3 text-center text-[0.8125rem] leading-snug text-muted-foreground">
            {query === ""
              ? "Type a handle to find someone."
              : "Nobody by that name in here."}
          </p>
        )
      ) : null}
    </div>
  );
}

/** The id of one row, for `aria-activedescendant` on the field. */
export function optionId(listId: string, index: number): string {
  return `${listId}-${index}`;
}

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
    if (plain || named || segment.clerkId === undefined) {
      return (
        <span
          key={index}
          className={chip}
          title={segment.clerkId === undefined ? "Everyone in this group" : undefined}
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
