"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useMemo } from "react";
import type { ActivityEntry } from "@/components/app/search-provider";
import { conversationName } from "@/lib/chat";
import { GENRES } from "@/lib/genres";
import { ACTIVITIES_HREF, CHAT_HREF } from "@/lib/nav";
import {
  type Hit,
  messageIcon,
  needleOf,
  scoreFolded,
  searchEntries,
} from "@/lib/search";
import { useDebounced } from "@/lib/use-debounced";
import { api } from "@convex/_generated/api";

/**
 * How long a keystroke sits before chat is asked about it.
 *
 * Everything else in this panel is answered in the browser, from lists that
 * are already here, so it moves on the frame you type. Messages are a Convex
 * query, and a Convex query is a live subscription — one per distinct
 * argument. Sending every prefix of what someone types would open and abandon
 * a subscription per letter, which is a lot of work for eight answers nobody
 * read. Long enough to skip the middle of a word, short enough that the chat
 * section lands while you are still looking at the panel.
 */
const CHAT_DEBOUNCE_MS = 180;

/** How many static results — destinations and settings together — can show.
 *  They are capped as one list so the best few survive whichever kind they
 *  are, rather than three mediocre pages holding a place above an exact
 *  settings match. */
const ENTRY_LIMIT = 4;

/** How many activities. The catalogue is by far the largest source and would
 *  otherwise be the whole panel for any common word. */
const ACTIVITY_LIMIT = 5;

/**
 * The four sources of the rail's search, asked and interleaved.
 *
 * Everything, which here means four sources that have nothing in common but
 * being findable:
 *
 * - the **destinations** in `src/lib/nav.ts`, and the account, which is a door
 *   out to the hosted profile UI rather than a page here;
 * - the **settings**, written down as searchable entries in `src/lib/search.ts`
 *   because a switch has no text in it to index;
 * - the **activity catalogue**, handed to the browser as a prop by the
 *   dashboard layout — never imported, see `SearchProvider`;
 * - **chat messages**, through a Convex full-text index, filtered on the
 *   server to the conversations the caller is actually in. See `search` in
 *   `convex/chat/messages.ts`, which is where that promise is kept.
 *
 * They are not merged into one index and could not be: three of them live in
 * different processes. Each answers for itself and this hook interleaves the
 * answers into one list, in a fixed order — the small precise sources first,
 * then the catalogue, then chat — so the panel is predictable rather than
 * reshuffling itself as the relative scores of four unrelated ranking schemes
 * cross over.
 *
 * `sections` is the list grouped under its headings and `hits` is the same
 * list flat, for the keyboard. `waiting` is true while chat has been asked
 * and has not yet answered, which is the one case the panel shows a spinner
 * for.
 */
export function useSearchHits(
  query: string,
  activities: readonly ActivityEntry[],
) {
  const needle = needleOf(query);

  // The catalogue, folded once. See `scoreFolded` — this is the array that
  // makes it worth having: 318 activities scored on every keystroke, against
  // strings that were normalised when the prop arrived rather than each time.
  const catalogue = useMemo(
    () =>
      activities.map((activity) => ({
        slug: activity.slug,
        title: activity.title,
        genre: activity.genre,
        name: needleOf(activity.title),
        // The slug and the genre, so "puzzle" finds the shelf's worth and a
        // remembered URL fragment finds the one. Held below the title by
        // `scoreFolded`'s caller, not by being weaker text.
        extra: needleOf(`${activity.slug} ${GENRES[activity.genre].label}`),
      })),
    [activities],
  );

  const entryHits = useMemo(() => searchEntries(needle, ENTRY_LIMIT), [needle]);

  const activityHits = useMemo<Hit[]>(() => {
    if (needle === "") return [];

    const scored: { entry: (typeof catalogue)[number]; rank: number }[] = [];
    for (const entry of catalogue) {
      const byName = scoreFolded(entry.name, needle);
      const rank =
        byName ?? (scoreFolded(entry.extra, needle) ?? Number.NaN) - 1000;
      if (Number.isNaN(rank)) continue;
      scored.push({ entry, rank });
    }

    return scored
      .sort((first, second) => second.rank - first.rank)
      .slice(0, ACTIVITY_LIMIT)
      .map(({ entry }) => ({
        id: `activity:${entry.slug}`,
        source: "activity" as const,
        title: entry.title,
        detail: GENRES[entry.genre].label,
        icon: GENRES[entry.genre].icon,
        tint: GENRES[entry.genre].hue,
        href: `${ACTIVITIES_HREF}/${entry.slug}`,
      }));
  }, [catalogue, needle]);

  // The raw query rather than the folded one: Convex's search index does its
  // own tokenising and stemming, and handing it a string with the punctuation
  // already beaten out would be second-guessing that.
  const chatText = useDebounced(query.trim(), CHAT_DEBOUNCE_MS);
  const { isAuthenticated } = useConvexAuth();
  const found = useQuery(
    api.chat.messages.search,
    isAuthenticated && chatText !== "" ? { text: chatText } : "skip",
  );

  const messageHits = useMemo<Hit[]>(
    () =>
      (found ?? []).map((message) => ({
        id: `message:${message._id}`,
        source: "message" as const,
        // The message is the result; who said it and where is the caption.
        // The other way round would make every row in this section look the
        // same until you read the second line.
        title: message.body,
        detail: `${message.authorHandle} in ${conversationName(message)}`,
        icon: messageIcon,
        href: `${CHAT_HREF}/${message.conversationId}`,
      })),
    [found],
  );

  // Rendered in this order and navigated in this order, which is the whole
  // reason it is one array: a keyboard walking the list and an eye walking the
  // panel have to agree, and two lists could drift.
  const sections = useMemo(() => {
    const grouped: { label: string; hits: Hit[] }[] = [
      {
        label: "Pages",
        hits: entryHits.filter((hit) => hit.source === "page"),
      },
      {
        label: "Account",
        hits: entryHits.filter((hit) => hit.source === "account"),
      },
      {
        label: "Settings",
        hits: entryHits.filter((hit) => hit.source === "setting"),
      },
      { label: "Activities", hits: activityHits },
      { label: "Messages", hits: messageHits },
    ];
    return grouped.filter((section) => section.hits.length > 0);
  }, [entryHits, activityHits, messageHits]);

  const hits = useMemo(
    () => sections.flatMap((section) => section.hits),
    [sections],
  );

  return {
    needle,
    sections,
    hits,
    waiting: found === undefined && chatText !== "",
  };
}
