/**
 * Naming somebody in a message.
 *
 * A mention is `@` followed by a handle, written into the body like any other
 * word. Nothing structured travels with the message from the client: the
 * server reads the body, looks each `@word` up, and decides for itself which
 * ones are people in the room — see `resolveMentions` in
 * `convex/chat/messages.ts`. A client-supplied list of ids would be a list the
 * server had to verify anyway, and a body that says `@alice` while the list
 * says somebody else is exactly the disagreement this arrangement cannot have.
 *
 * ## Why the filter has to know
 *
 * `@name` is how a handle is written on every platform there is, which is why
 * `AT_HANDLE` in `convex/moderation/patterns.ts` refuses it as contact details
 * — the rule this whole directory cares most about. A mention is the one
 * `@name` that is not a doorway out of the room: it names somebody who is
 * already in it. So the verified ones are masked out before the patterns run,
 * and only the patterns. The word lists still read ordinary people's handles,
 * because a handle sitting next to ordinary text can still spell something
 * across the boundary (`s @hit`), and that is the squash-and-separator trick
 * `normalize.ts` exists to catch. A caller may separately blank a verified
 * synthetic handle such as the reserved `@bot`; see `screen` in `verdict.ts`.
 *
 * The pattern is mirrored in `src/lib/mentions.ts`, which draws the chips.
 * Change one, change the other. The server is the one that decides.
 */

/** The one mention that is not a handle. Reserved, so nobody can own it. */
export const EVERYONE = "everyone";

/**
 * `@` then three to twenty handle characters, not glued onto the word before
 * it (so an email address is not a mention) and not cut short by one after.
 * Case-insensitive because people type names with capitals; handles are
 * stored lowercase and matched that way.
 */
const MENTION_PATTERN = /(^|[^a-z0-9_@-])@([a-z0-9_-]{2,64})(?![a-z0-9_-])/gi;

export type MentionToken = {
  /** Lowercased, without the `@`. */
  handle: string;
  /** Offsets into the text, `start` at the `@` and `end` just past the word. */
  start: number;
  end: number;
};

/** Every `@word` in the text, in order, in the shape a mention could have. */
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
 * The text with the verified mentions blanked, for the pattern rules.
 *
 * Each one becomes a single space, which keeps the words on either side apart:
 * `add @alice on discord` still reads as an invitation to a platform once
 * `@alice` is gone, because `add` and `discord` are still four tokens apart.
 */
export function maskMentions(text: string, handles: ReadonlySet<string>): string {
  if (handles.size === 0) return text;
  let out = "";
  let last = 0;
  for (const token of findMentionTokens(text)) {
    if (!handles.has(token.handle)) continue;
    out += `${text.slice(last, token.start)} `;
    last = token.end;
  }
  return out + text.slice(last);
}
