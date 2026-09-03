import { GLOBAL_COOLDOWN_MS, MAX_BODY, type Surface } from "./limits";
import { scan, type Match } from "./lexicon";
import { prepare } from "./normalize";
import { findPatterns } from "./patterns";
import {
  excerpt,
  hashBody,
  isBroadcast,
  isDuplicate,
  isTargeted,
  refusalForCategory,
  refusalForPattern,
  weightFor,
  type RecentSend,
  type Refusal,
} from "./rules";
import { overRate, tierFor } from "./standing";

/**
 * The one function that decides whether a message exists.
 *
 * Everything else in this directory is a component of it: the shape check, the
 * folding, the word lists, the patterns, the arrangements, the ladder. This is
 * the order they run in, and the order is load-bearing — the cheap checks come
 * first so that a two-thousand-character message from a banned account costs a
 * comparison rather than a scan, and the mutation's one-second budget is never
 * spent on somebody who was not allowed to speak in the first place.
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
  /** Unexpired strike weight, already summed. */
  standing: number;
  mutedUntil?: number;
  bannedAt?: number;
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
};

/** What the ledger should record, when it should record anything. */
export type StrikeSpec = {
  rule: Refusal;
  weight: number;
  banOnSight: boolean;
  excerpt: string;
};

export type Verdict =
  | { allow: false; refusal: Refusal; strike: StrikeSpec | null }
  | { allow: true; body: string; hash: string };

/** A refusal that costs nothing and says nothing to the ledger. */
function refuse(refusal: Refusal): Verdict {
  return { allow: false, refusal, strike: null };
}

/** A refusal that does. */
function strikeFor(refusal: Refusal, body: string, banOnSight = false): Verdict {
  const weight = weightFor(refusal);
  if (weight === 0 && !banOnSight) return refuse(refusal);
  return {
    allow: false,
    refusal,
    strike: { rule: refusal, weight, banOnSight, excerpt: excerpt(body) },
  };
}

/**
 * The heaviest thing found, so one message produces one strike.
 *
 * A message containing a slur and a link is refused for the slur. Charging for
 * both would mean a single message could cross two rungs of the ladder at once,
 * and the person on the other end of that would be told they had been muted for
 * "several things", which is not an explanation.
 */
function worst(matches: Match[]): Match | null {
  let found: Match | null = null;
  for (const match of matches) {
    if (match.tier === 3) continue;
    if (found === null) {
      found = match;
      continue;
    }
    if (match.banOnSight && !found.banOnSight) found = match;
    else if (match.tier < found.tier && !found.banOnSight) found = match;
  }
  return found;
}

export function screen(raw: string, context: SendContext): Verdict {
  // Standing first. None of it depends on what was typed, and an account that
  // may not speak should not have its message read at all.
  if (context.bannedAt !== undefined) return refuse("banned");
  if (context.mutedUntil !== undefined && context.mutedUntil > context.now) {
    return refuse("muted");
  }

  if (
    context.surface === "global" &&
    context.now - context.createdAt < GLOBAL_COOLDOWN_MS
  ) {
    return refuse("too-new");
  }

  const tier = tierFor(
    context.createdAt,
    context.messagesSent,
    context.standing,
    context.now,
  );
  if (overRate(context.recent, tier, context.now)) {
    return strikeFor("too-fast", raw.slice(0, 40));
  }

  // A message that is only pictures. Everything above still applied — a muted
  // account cannot send a picture either, and pictures count against the
  // rate — but there is no text to fold, scan, or match, and the shape check
  // would refuse it as empty. The duplicate and broadcast rules are skipped
  // too, and not out of leniency: an attachment can be sent exactly once, so
  // the same key cannot appear twice in the ring for either of them to find.
  if (raw.trim() === "" && context.attachmentKey !== undefined) {
    return { allow: true, body: "", hash: hashBody(`image:${context.attachmentKey}`) };
  }

  // Shape, which is also the length cap, and therefore the guard that keeps
  // every pattern below it running against a bounded string.
  const prepared = prepare(raw, MAX_BODY[context.surface]);
  if (!prepared.ok) return strikeFor(prepared.reason, raw.slice(0, 40));

  const { clean, forms } = prepared;
  const matches = scan(forms);

  const severe = worst(matches);
  if (severe !== null) {
    return strikeFor(refusalForCategory(severe.category), clean, severe.banOnSight);
  }

  const patterns = findPatterns(clean, forms.tokens);
  if (patterns.length > 0) {
    return strikeFor(refusalForPattern(patterns[0].category), clean);
  }

  // Everything left is tier three: ordinary swearing, which does not go
  // through. The only question left is what it costs, and that is the
  // arrangement rather than the word — pointed at somebody it is harassment and
  // goes on the record, and on its own it is a refusal that costs nothing.
  const profanity = matches.filter((match) => match.tier === 3);
  if (profanity.length > 0) {
    const tokens = profanity
      .map((match) => match.token)
      .filter((token): token is string => token !== undefined);
    if (isTargeted(forms.tokens, tokens)) return strikeFor("harassment", clean);
    return refuse("profanity");
  }

  const hash = hashBody(forms.squashed);

  if (isDuplicate(context.recent, hash, context.now)) return refuse("duplicate");

  if (isBroadcast(context.recent, hash, context.conversationId, context.now)) {
    return strikeFor("broadcast", clean);
  }

  return { allow: true, body: clean, hash };
}

/**
 * The same screening, for text that is not a message.
 *
 * A group title is read by everyone who sees the group and has no sender, no
 * conversation and no history, so the standing checks, the rate windows and the
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

  const patterns = findPatterns(clean, forms.tokens);
  if (patterns.length > 0) {
    return { ok: false, refusal: refusalForPattern(patterns[0].category) };
  }

  return { ok: true, text: clean };
}
