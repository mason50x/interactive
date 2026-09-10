"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import {
  useMentionPeople,
  type MentionCandidate,
  type MentionPerson,
} from "@/components/app/chat/mentions";
import { EVERYONE, completeMention, mentionQueryAt } from "@/lib/mentions";
import type { Id } from "../../../../../convex/_generated/dataModel";

/**
 * The `@` in the composer: where the caret is, whether there is an `@word`
 * under it, who to offer for it, and what the keys do while the list is up.
 *
 * Its own hook because the picker is a question about the caret as much as
 * about the text, and the caret is state the field's change handler never
 * sees. The composer hands over the text as the field holds it and the
 * function that commits an edit, and gets back everything the picker and
 * the field's `aria-*` need.
 */
export function useMentionInput({
  shown,
  fieldRef,
  commit,
  maxLength,
  conversationId,
  kind,
  peer,
  authors,
  me,
}: {
  /** The text as the field holds it, dictation guess included. */
  shown: string;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  /** The whole text, as edited, into the composer's `body`. */
  commit: (next: string) => void;
  /** A completion that would push the text past this is refused. */
  maxLength: number;
  /** For the mention picker. See `useMentionPeople`. */
  conversationId: Id<"conversations">;
  kind: "global" | "dm" | "group" | null;
  peer: MentionPerson | null;
  authors: MentionPerson[];
  me: string | null | undefined;
}) {
  /**
   * Where the caret is, for the picker.
   *
   * Tracked from the field's events rather than read at render, because the
   * caret moves on keys the change handler never sees — the arrows, a click
   * — and whether there is an `@word` under it is a question about the caret
   * as much as about the text.
   */
  const [caret, setCaret] = useState(0);

  /**
   * Where the caret was told to go once the next render has put the text
   * there. Set by a pick and consumed by the layout effect below: the field
   * cannot be told a position inside text it does not hold yet.
   */
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const at = pendingCaret.current;
    if (at === null) return;
    pendingCaret.current = null;
    fieldRef.current?.setSelectionRange(at, at);
  });

  /** The `@` somebody pressed Escape on, so it stays closed until the next. */
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [active, setActive] = useState(0);

  /**
   * The `@word` under the caret, and the people to offer for it.
   *
   * Open is "there is one, and it was not escaped out of". The list is
   * asked for only while it is open, which is what keeps a group's member
   * list off the thread's subscriptions — see `useMentionPeople`.
   */
  const mention = mentionQueryAt(shown, caret);
  const picking = mention !== null && dismissed !== mention.start;
  const people = useMentionPeople({
    conversationId,
    kind,
    peer,
    authors,
    me,
    open: picking,
    query: mention?.query ?? "",
  });
  const candidates = picking ? people.candidates : [];
  const highlighted = Math.min(active, Math.max(0, candidates.length - 1));

  /** What the box's chips are drawn from: everybody the picker has offered. */
  function resolveTyped(handle: string): string | null | undefined {
    if (handle === EVERYONE) return kind === "group" ? null : undefined;
    return people.known.get(handle)?.clerkId;
  }

  /** Finish the `@word` under the caret with the person picked. */
  function pick(candidate: MentionCandidate) {
    if (mention === null) return;
    const handle =
      candidate.kind === "everyone" ? EVERYONE : candidate.person.handle;
    const next = completeMention(shown, mention.start, caret, handle);
    if (next.text.length > maxLength) return;
    commit(next.text);
    setCaret(next.caret);
    pendingCaret.current = next.caret;
    setDismissed(null);
    setActive(0);
    fieldRef.current?.focus();
  }

  /**
   * While the picker is up the keys are its: the arrows walk it, Enter and
   * Tab take the row, Escape puts it away until the next `@`. With nobody
   * in it Enter is Enter again, so a word that matches no one still sends.
   * Returns whether the key was taken.
   */
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!picking || mention === null) return false;
    if (event.key === "Escape") {
      event.preventDefault();
      setDismissed(mention.start);
      return true;
    }
    if (candidates.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((highlighted + 1) % candidates.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((highlighted - 1 + candidates.length) % candidates.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pick(candidates[highlighted]);
        return true;
      }
    }
    return false;
  }

  return {
    setCaret,
    setActive,
    mention,
    picking,
    people,
    candidates,
    highlighted,
    resolveTyped,
    pick,
    onKeyDown,
  };
}
