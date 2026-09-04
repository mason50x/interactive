import { BROADCAST, DUPLICATE_WINDOW_MS, EXCERPT_CHARS } from "./limits";
import type { Category } from "./lexicon";
import type { PatternCategory } from "./patterns";

/**
 * What each finding costs, and the handful of rules that need more than one
 * message to see.
 *
 * The lexicon and the patterns answer "is this in the message". Nothing they
 * return is a decision — `fuck` is a free bounce and `you are a fuck` is a
 * strike, and the difference is not a word, it is an arrangement of words. This
 * is where the arrangement is read, and where the last sends are allowed to
 * matter.
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
  | "muted"
  | "banned"
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
  | "not-agreed"
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

/**
 * The weight each refusal adds to the sender's standing.
 *
 * Read this table against the ladder in `convex/moderation/limits.ts` and the
 * whole enforcement policy is legible in about ten seconds, which is the point
 * of both being numbers in one place. One slur is eight, which is an hour's
 * mute on its own. One link is two, so a person who has not read the rules
 * bumps into them twice before anything happens to them.
 *
 * Zero means refused and not held against you. A malformed message is a bug or
 * a paste, and `duplicate` is almost always somebody hitting send twice.
 */
const WEIGHTS: Record<Refusal, number> = {
  empty: 0,
  "too-long": 0,
  "hidden-characters": 0,
  // Not zero: embedding a right-to-left override in an English sentence is not
  // something that happens by accident.
  reordering: 3,
  "stacked-marks": 1,
  "too-many-lines": 0,
  slur: 8,
  sexual: 8,
  exploitation: 8,
  threat: 8,
  "self-harm": 6,
  degrading: 6,
  harassment: 4,
  // Refused, and free. Swearing at nobody in particular is a house rule, not
  // something to hold against a thirteen-year-old; the same word aimed at a
  // person is `harassment` above and is charged there.
  profanity: 0,
  contact: 3,
  link: 2,
  location: 4,
  duplicate: 0,
  broadcast: 3,
  "too-fast": 1,
  muted: 0,
  banned: 0,
  "not-a-member": 0,
  blocked: 0,
  "reply-unavailable": 0,
  mention: 0,
  "mention-everyone": 0,
  "too-new": 0,
  // Not a violation. They have not agreed to the rules being enforced
  // against them, which is a reason to refuse and not a reason to charge.
  "not-agreed": 0,
  // A gory picture is charged like telling somebody to hurt themselves: it
  // is not the sexual rung, and it is more than a link.
  graphic: 6,
  // The rest are about the file and the service, not the person.
  image: 0,
  "image-check": 0,
  "too-many-images": 0,
};

export function weightFor(refusal: Refusal): number {
  return WEIGHTS[refusal];
}

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

/**
 * What of the message is kept on the strike it caused.
 *
 * Enough to recognise, not enough to republish. The person it happened to is
 * shown their own ledger, and a strike that says only "slur" with no excerpt is
 * an accusation they cannot check.
 */
export function excerpt(body: string): string {
  return body.length <= EXCERPT_CHARS
    ? body
    : `${body.slice(0, EXCERPT_CHARS)}…`;
}
