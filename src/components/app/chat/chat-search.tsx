"use client";

import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { useQuery } from "convex/react";
import { useEffect, useState, type RefObject } from "react";
import { Empty, Group, PersonRow } from "@/components/app/chat/people-rows";
import { Searching } from "@/components/app/chat/searching";
import { api } from "../../../../convex/_generated/api";

/**
 * One field over the conversation list, for both things a field there is for:
 * finding a conversation you already have, and finding a person you do not.
 *
 * The list filters itself against the term — see `ConversationList` — and
 * from the second character `People` below asks the handle index for anybody
 * else. A person found here is pressed to open their card, which is where
 * Message and Add live, so starting a conversation with a stranger is: type
 * their handle, press their name, press Message.
 */
export function SearchField({
  term,
  onTermChange,
  fieldRef,
}: {
  term: string;
  onTermChange: (term: string) => void;
  fieldRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="flex h-9 items-center gap-2 rounded-lg border border-border bg-foreground/[0.03] px-2.5 transition-colors focus-within:border-ring focus-within:bg-background focus-within:ring-1 focus-within:ring-ring">
      <MagnifyingGlassIcon className="size-4 shrink-0 text-muted-foreground" />
      <input
        ref={fieldRef}
        type="search"
        value={term}
        onChange={(event) => onTermChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && term !== "") {
            event.preventDefault();
            onTermChange("");
          }
        }}
        placeholder="Search chats, or a handle"
        aria-label="Search conversations and people"
        spellCheck={false}
        autoComplete="off"
        maxLength={40}
        className="h-full min-w-0 flex-1 bg-transparent text-[0.875rem] outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:appearance-none"
      />
      {term === "" ? null : (
        <button
          type="button"
          onClick={() => {
            onTermChange("");
            fieldRef.current?.focus();
          }}
          aria-label="Clear search"
          className="flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <XMarkIcon className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * Everybody the term finds who is not already in the list above.
 *
 * Debounced, because every keystroke used to be its own query and the
 * half-typed ones mostly match nobody — so "Nobody found" flashed up between
 * the letters of a handle that does exist.
 */
export function People({
  term,
  exclude,
}: {
  term: string;
  /** Clerk ids already drawn as conversations, so nobody appears twice. */
  exclude: ReadonlySet<string>;
}) {
  const wanted = term.trim().toLowerCase();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setQuery(wanted), 250);
    return () => clearTimeout(timer);
  }, [wanted]);

  const found = useQuery(
    api.chat.profiles.search,
    query.length >= 2 ? { term: query } : "skip",
  );

  if (wanted.length < 2) return null;

  const settled = query === wanted && found !== undefined;
  const rows = (found ?? []).filter((person) => !exclude.has(person.clerkId));

  return (
    <Group label="People">
      {!settled ? (
        <li>
          <Searching />
        </li>
      ) : rows.length === 0 ? (
        <Empty>
          Nobody by that handle, or they are not letting themselves be found.
        </Empty>
      ) : (
        rows.map((person) => <PersonRow key={person.clerkId} person={person} />)
      )}
    </Group>
  );
}
