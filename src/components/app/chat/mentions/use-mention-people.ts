"use client";

import { BOT_MENTION_HANDLES } from "@config/bot";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import type {
  MentionCandidate,
  MentionPerson,
} from "@/components/app/chat/mentions";
import { BOT_HANDLE, BOT_ID, BOT_NAME } from "@/lib/chat";
import { useDebounced } from "@/lib/hooks/use-debounced";
import { EVERYONE } from "@/lib/mentions";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

/**
 * Who the composer offers when `@` is pressed. See `mentions.tsx` for how the
 * three pieces of mentioning fit together and who is offered in which room.
 */

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
  const term = useDebounced(query, SEARCH_DEBOUNCE_MS);
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
    if (global) {
      add({ clerkId: BOT_ID, handle: BOT_HANDLE, displayName: BOT_NAME });
    }
    for (const author of authors) add(author);
    if (peer !== null) add(peer);
    for (const member of members ?? []) {
      if (member.status !== "active") continue;
      add({
        clerkId: member.clerkId,
        handle: member.handle,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
        avatarHue: member.avatarHue,
        avatarEmoji: member.avatarEmoji,
        avatarInitials: member.avatarInitials,
      });
    }
    for (const friend of friends ?? []) add(friend);
    for (const person of found ?? []) add(person);
    return list;
  }, [authors, peer, members, friends, found, me, global]);

  // Remembered across the picker closing. Set during render, which is the
  // sanctioned shape for state that mirrors other state — see `ghost` in the
  // composer for the same move.
  const [known, setKnown] = useState<Map<string, MentionPerson>>(
    () => new Map(),
  );
  const unseen = people.filter((person) => !known.has(person.handle));
  if (unseen.length > 0) {
    const next = new Map(known);
    for (const person of unseen) {
      next.set(person.handle, person);
      if (person.clerkId === BOT_ID) {
        for (const handle of BOT_MENTION_HANDLES) next.set(handle, person);
      }
    }
    setKnown(next);
  }

  const candidates = useMemo(() => {
    const ranked = people
      .map((person, index) => ({ person, index, rank: rankOf(person, query) }))
      .filter(
        (entry): entry is typeof entry & { rank: number } =>
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
