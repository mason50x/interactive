import { BROADCAST, DUPLICATE_WINDOW_MS } from "./limits";
import type { Category } from "./lexicon";
import type { PatternCategory } from "./patterns";

/**
 * The rules that need more than one message to see.
 *
 * The lexicon and the patterns answer "is this in the message". Nothing they
 * return is a decision — `fuck` is a free bounce and `you are a fuck` is a
 * refusal, and the difference is not a word, it is an arrangement of words.
 * This is where the arrangement is read, and where the last sends are allowed
 * to matter.
 */

/** Everything a message can be refused for, in the vocabulary the client sees. */
export type Refusal =
  | "empty"
  | "too-long"
  | "hidden-characters"
  | "reordering"
  | "stacked-marks"
  | "too-many-lines"
  | "slur"
  | "sexual"
  | "exploitation"
  | "threat"
  | "self-harm"
  | "degrading"
  | "harassment"
  | "profanity"
  | "contact"
  | "link"
  | "location"
  | "duplicate"
  | "broadcast"
  | "too-fast"
  | "not-a-member"
  | "blocked"
  | "reply-unavailable"
  // A mention that could not be honoured: somebody named who is not in the
  // conversation, or `@everyone` outside a group. Both are the word being
  // handed back to be changed, and neither costs anything — see
  // `resolveMentions` in `convex/chat/messages.ts`.
  | "mention"
  | "mention-everyone"
  | "too-new"
  // Pictures. `sexual`, `self-harm` and `exploitation` above are shared with
  // them — a picture of a thing is refused under the same name as a sentence
  // about it. The three below are theirs alone: `graphic` is gore, which a
  // word list has no category for; `image` is a file that could not be used
  // at all; `image-check` is the classifier being unreachable, which refuses
  // the picture rather than letting it through unread.
  | "graphic"
  | "image"
  | "image-check"
  | "too-many-images";

/** A lexicon category, as the client is told about it. */
export function refusalForCategory(category: Category): Refusal {
  return category;
}

export function refusalForPattern(category: PatternCategory): Refusal {
  return category;
}

/**
 * The ways of writing "you" that a fourteen-year-old actually writes.
 *
 * Folded and lowercased by the time they get here, so this is only about
 * spelling, not about case or accents.
 */
const SECOND_PERSON = new Set([
  "you",
  "u",
  "ur",
  "your",
  "youre",
  "ure",
  "yours",
  "yourself",
  "urself",
  "yall",
  "yalls",
  "ya",
]);

/**
 * Whether a tier-three word is pointed at somebody.
 *
 * This is the rule that decides what swearing costs. `this game is shit` and
 * `you are shit` contain the same word and are not the same message: both are
 * refused, and only the second goes on a record. The only thing separating them
 * is a pronoun four tokens away. Four is wide enough for `you are such a shit`
 * and narrow enough not to reach into the next sentence.
 */
export function isTargeted(tokens: string[], flaggedTokens: string[]): boolean {
  const flagged = new Set(flaggedTokens);
  for (let index = 0; index < tokens.length; index += 1) {
    if (!flagged.has(tokens[index])) continue;
    const from = Math.max(0, index - 4);
    const to = Math.min(tokens.length, index + 5);
    for (let nearby = from; nearby < to; nearby += 1) {
      if (nearby !== index && SECOND_PERSON.has(tokens[nearby])) return true;
    }
  }
  return false;
}

/**
 * One earlier send, as the ring on the sender's profile remembers it.
 *
 * `flagged` is a leftover from when tier three posted: the ring only ever holds
 * messages that were allowed, and no allowed message carries a tier-three word
 * any more, so it is written `false` every time. Kept because Convex validates
 * the documents already in the table against the schema, and dropping the field
 * would be a migration rather than an edit.
 */
export type RecentSend = {
  at: number;
  conversationId: string;
  hash: string;
  flagged: boolean;
};

/**
 * A cheap, stable hash of the folded message.
 *
 * djb2, because the ring holds twenty of these and they are compared for
 * equality and nothing else. Hashing the *folded* form rather than the typed
 * one is what makes it useful: `stop it`, `st0p it` and `sto p it` are one
 * message sent three times, and storing the text itself would also mean keeping
 * twenty copies of what everybody said on their own profile row.
 */
export function hashBody(squashed: string): string {
  let hash = 5381;
  for (let index = 0; index < squashed.length; index += 1) {
    hash = ((hash << 5) + hash + squashed.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/** The same thing, again, within the window. */
export function isDuplicate(
  recent: RecentSend[],
  hash: string,
  now: number,
): boolean {
  for (const send of recent) {
    if (send.hash === hash && now - send.at < DUPLICATE_WINDOW_MS) return true;
  }
  return false;
}

/**
 * The same thing into several conversations at once.
 *
 * Counted across conversations rather than within one, because within one it is
 * a duplicate and outside one it is somebody working through a list. The
 * current conversation counts towards the total, so the threshold is reached on
 * the third room rather than the fourth.
 */
export function isBroadcast(
  recent: RecentSend[],
  hash: string,
  conversationId: string,
  now: number,
): boolean {
  const rooms = new Set<string>([conversationId]);
  for (const send of recent) {
    if (send.hash !== hash) continue;
    if (now - send.at >= BROADCAST.ms) continue;
    rooms.add(send.conversationId);
  }
  return rooms.size >= BROADCAST.conversations;
}
