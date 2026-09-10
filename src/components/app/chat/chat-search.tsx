"use client";

import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { useQuery } from "convex/react";
import type { RefObject } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, InputAddon, InputGroup } from "@/components/ui/input";
import { Group, PersonRow } from "@/components/app/chat/people-rows";
import { useDebounced } from "@/lib/use-debounced";
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
    <InputGroup className="bg-foreground/[0.03] px-2.5 transition-colors focus-within:bg-background">
      <InputAddon className="text-muted-foreground">
        <MagnifyingGlassIcon />
      </InputAddon>
      <Input
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
        className="h-full [&::-webkit-search-cancel-button]:appearance-none"
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
    </InputGroup>
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
  const query = useDebounced(wanted, 250);

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
        <EmptyState as="li">
          Nobody by that handle, or they are not letting themselves be found.
        </EmptyState>
      ) : (
        rows.map((person) => <PersonRow key={person.clerkId} person={person} />)
      )}
    </Group>
  );
}
