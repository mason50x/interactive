/**
 * The client's half of mentions: finding `@words` in text, and nothing that
 * decides whether they are anybody.
 *
 * Deciding is the server's — `resolveMentions` in `convex/chat/messages.ts`
 * reads the body it is sent and works out for itself who is named. What the
 * client does with the same pattern is draw: the chips in a sent message, the
 * chips in the box while it is being typed, and the word under the caret that
 * the picker is filtering on.
 *
 * The pattern mirrors `MENTION_PATTERN` in `convex/moderation/mentions.ts`,
 * for the reason `REACTIONS` in `src/lib/chat.ts` mirrors its own: the two
 * bundles do not share a module, and the moderation directory must never be
 * imported from here. Change one, change the other. The server is the one
 * that decides.
 */

/** The one mention that is not a person. Groups only. */
export const EVERYONE = "everyone";

/** `@` then three to twenty handle characters, standing on its own. */
const MENTION_PATTERN = /(^|[^a-z0-9_@])@([a-z0-9_]{3,20})(?![a-z0-9_])/gi;

/**
 * The same shape, cut off at the caret: `@`, then whatever has been typed of
 * the handle so far, which may be nothing. This is what opens the picker.
 */
const MENTION_AT_END = /(^|[^a-z0-9_@])@([a-z0-9_]{0,20})$/i;

export type MentionToken = {
  /** Lowercased, without the `@`. */
  handle: string;
  start: number;
  end: number;
};

export function findMentionTokens(text: string): MentionToken[] {
  const found: MentionToken[] = [];
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const start = (match.index ?? 0) + match[1].length;
    found.push({
      handle: match[2].toLowerCase(),
      start,
      end: start + 1 + match[2].length,
    });
  }
  return found;
}

/**
 * The `@word` the caret is at the end of, if it is at the end of one.
 *
 * `start` is the `@`, so that picking a person replaces the whole word. The
 * character after the caret is checked too: a caret in the middle of `@alice`
 * is editing a mention, not starting one, and a picker opening there would
 * replace half of it.
 */
export function mentionQueryAt(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const match = MENTION_AT_END.exec(text.slice(0, caret));
  if (match === null) return null;
  if (/[a-z0-9_]/i.test(text.charAt(caret))) return null;
  return { start: match.index + match[1].length, query: match[2].toLowerCase() };
}

/** A run of the body: plain words, or a mention that resolved to somebody. */
export type Segment =
  | { kind: "text"; text: string }
  | {
      kind: "mention";
      /** The `@word` as it was typed. */
      text: string;
      /** Lowercased handle, without the `@`. */
      handle: string;
      /** Absent for `@everyone`. */
      clerkId?: string;
    };

/**
 * Split a body around the `@words` that `resolve` recognises.
 *
 * `resolve` answers for a lowercased handle with the id of the person, `null`
 * for `@everyone` where it counts, or `undefined` for a word that is nobody —
 * which stays text. That is the whole contract, so the same function draws a
 * sent message (from its stored `mentions`) and the composer (from the people
 * it has offered): neither needs to know how the other found out.
 */
export function segmentMentions(
  body: string,
  resolve: (handle: string) => string | null | undefined,
): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const token of findMentionTokens(body)) {
    const who = resolve(token.handle);
    if (who === undefined) continue;
    if (token.start > last) {
      segments.push({ kind: "text", text: body.slice(last, token.start) });
    }
    segments.push({
      kind: "mention",
      text: body.slice(token.start, token.end),
      handle: token.handle,
      clerkId: who ?? undefined,
    });
    last = token.end;
  }
  if (last < body.length) {
    segments.push({ kind: "text", text: body.slice(last) });
  }
  return segments;
}

/**
 * The text with `@partial` at `start` replaced by a finished mention and a
 * space, and where the caret lands after it.
 */
export function completeMention(
  text: string,
  start: number,
  caret: number,
  handle: string,
): { text: string; caret: number } {
  const inserted = `@${handle} `;
  return {
    text: text.slice(0, start) + inserted + text.slice(caret),
    caret: start + inserted.length,
  };
}
