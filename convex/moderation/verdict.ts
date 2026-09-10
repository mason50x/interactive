import { MAX_BODY, type Surface } from "./limits";
import { scan, type Match } from "./lexicon";
import { maskMentions } from "./mentions";
import { buildForms, prepare } from "./normalize";
import { findPatterns } from "./patterns";
import {
  hashBody,
  isBroadcast,
  isDuplicate,
  refusalForCategory,
  refusalForPattern,
  type RecentSend,
  type Refusal,
} from "./rules";
import { overRate, tierFor } from "./rate";

/**
 * The one function that decides whether a message exists.
 *
 * Everything else in this directory is a component of it: the shape check, the
 * folding, the word lists, the patterns, and the arrangements. This is the
 * order they run in, and the order is load-bearing — cheap shape and rate checks
 * happen before the bounded text scan.
 *
 * ## It is pure
 *
 * No database, no clock of its own, no Convex imports. Everything it needs
 * arrives in `SendContext` and everything it decides comes back in the return
 * value, which is what lets `convex/moderation/inspect.ts` run the whole
 * pipeline against a string from the command line without a message existing.
 * On a system with no moderators, being able to ask "what would this do" and
 * get the real answer is the only way the rules ever get tuned.
 *
 * ## What it will not catch
 *
 * Plenty. A deterministic filter reads spelling, not meaning, so it does not
 * catch a sentence that is cruel without containing a single listed word, or a
 * grooming conversation conducted entirely in ordinary vocabulary, or sarcasm
 * of any kind. That is the accepted cost of the design, and it is why blocking,
 * reporting and the DM policy exist alongside it rather than as afterthoughts:
 * the filter handles what is mechanical, and the people in the room handle what
 * is not. Anyone extending this should be honest about which half a new rule is
 * in.
 */

/** Everything the decision depends on, gathered by the caller. */
export type SendContext = {
  surface: Surface;
  conversationId: string;
  now: number;
  /** When the sender's chat profile was made. */
  createdAt: number;
  messagesSent: number;
  recent: RecentSend[];
  /**
   * Set when the message carries pictures: the attachment ids, joined.
   *
   * Its presence is what lets a message with no words through — the pictures
   * are the message — and its value is what the ring records for it. The
   * pictures themselves are not judged here; each one was judged on upload,
   * by `convex/moderation/images.ts`, and `messages.send` refuses any that
   * did not pass before this ever runs.
   */
  attachmentKey?: string;
  /**
   * The `@words` in the body that the caller has already established are
   * people in this conversation, lowercased and without the `@`. These and
   * only these are hidden from the contact-details rule — see
   * `convex/moderation/mentions.ts` for why the word lists still see them.
   */
  mentions?: ReadonlySet<string>;
  /**
   * Verified synthetic mentions whose handles must not be read as message
   * text by the lexicon. This is deliberately narrower than `mentions`:
   * ordinary people's handles still go through the word lists, while a
   * reserved system handle such as `@bot` cannot create a match merely by
   * being present.
   */
  lexiconExemptMentions?: ReadonlySet<string>;
};

export type Verdict =
  | { allow: false; refusal: Refusal }
  | { allow: true; body: string; hash: string };

function refuse(refusal: Refusal): Verdict {
  return { allow: false, refusal };
}

/**
 * The most severe category found, so one refusal is returned.
 *
 * A message containing a slur and profanity is refused for the slur. One clear
 * reason is more useful than an arbitrary list ordered by scan position.
 */
function worst(matches: Match[]): Match | null {
  let found: Match | null = null;
  for (const match of matches) {
    if (match.tier === 3) continue;
    if (found === null) {
      found = match;
      continue;
    }
    if (match.tier < found.tier) found = match;
  }
  return found;
}

export function screen(raw: string, context: SendContext): Verdict {
  const tier = tierFor(context.createdAt, context.messagesSent, context.now);
  if (overRate(context.recent, tier, context.now)) {
    return refuse("too-fast");
  }

  // A message that is only pictures. The rate still applies, but there is no
  // text to fold, scan, or match, and the shape check would refuse it as empty.
  // The duplicate and broadcast rules are skipped because an attachment can be
  // sent exactly once, so its key cannot appear twice in the ring.
  if (raw.trim() === "" && context.attachmentKey !== undefined) {
    return { allow: true, body: "", hash: hashBody(`image:${context.attachmentKey}`) };
  }

  // Shape, which is also the length cap, and therefore the guard that keeps
  // every pattern below it running against a bounded string.
  const prepared = prepare(raw, MAX_BODY[context.surface]);
  if (!prepared.ok) return refuse(prepared.reason);

  const { clean, forms } = prepared;

  // A reserved system mention is syntax, not something the sender said. In
  // particular, normalisation folds `@` to leetspeak `a`, so `@bot` becomes
  // `abot` and can accidentally begin a listed term. Blank only the synthetic
  // handles the caller explicitly trusts; real handles remain visible to the
  // lexicon so they cannot be used to split an unsafe word across a boundary.
  const lexiconText =
    context.lexiconExemptMentions === undefined
      ? clean
      : maskMentions(clean, context.lexiconExemptMentions);
  const lexiconForms = lexiconText === clean ? forms : buildForms(lexiconText);
  const matches = scan(lexiconForms);

  const severe = worst(matches);
  if (severe !== null) {
    return refuse(refusalForCategory(severe.category));
  }

  // The patterns alone read a copy with the verified mentions blanked out:
  // `@alice` is contact details everywhere except when alice is in the room.
  // The lexicon above read the whole thing, on purpose.
  const masked =
    context.mentions === undefined ? clean : maskMentions(clean, context.mentions);
  const patterns = findPatterns(masked);
  if (patterns.length > 0) {
    return refuse(refusalForPattern(patterns[0].category));
  }

  // Casual profanity and mild insults do not block conversation.
  const hash = hashBody(forms.squashed);

  if (isDuplicate(context.recent, hash, context.now)) return refuse("duplicate");

  if (isBroadcast(context.recent, hash, context.conversationId, context.now)) {
    return refuse("broadcast");
  }

  return { allow: true, body: clean, hash };
}

/**
 * The same screening, for text that is not a message.
 *
 * A group title is read by everyone who sees the group and has no sender, no
 * conversation and no history, so the rate windows and the
 * cross-message rules have nothing to work on. What is left is the part that
 * reads the text itself — shape, lexicon, patterns. Tier three is refused here
 * as it is in `screen`, with the difference that there is no arrangement to
 * read: a name is not something you say once, and no pronoun nearby is going to
 * make a group called `shitheads` fine.
 */
export function screenStatic(
  raw: string,
  maxLength: number,
): { ok: true; text: string } | { ok: false; refusal: Refusal } {
  const prepared = prepare(raw, maxLength);
  if (!prepared.ok) return { ok: false, refusal: prepared.reason };

  const { clean, forms } = prepared;

  const matches = scan(forms);
  if (matches.length > 0) {
    const severe = worst(matches);
    const found = severe ?? matches[0];
    return { ok: false, refusal: refusalForCategory(found.category) };
  }

  const patterns = findPatterns(clean);
  if (patterns.length > 0) {
    return { ok: false, refusal: refusalForPattern(patterns[0].category) };
  }

  return { ok: true, text: clean };
}
