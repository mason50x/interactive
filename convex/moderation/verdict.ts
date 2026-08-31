import { GLOBAL_COOLDOWN_MS, MAX_BODY, SOFTEN_TIER_3, type Surface } from "./limits";
import { scan, type Match } from "./lexicon";
import { prepare } from "./normalize";
import { findPatterns } from "./patterns";
import {
  excerpt,
  hashBody,
  isBroadcast,
  isDuplicate,
  isHounding,
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
  | { allow: true; body: string; hash: string; flags: string[]; flagged: boolean };

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

  // Everything left is tier three: allowed on its own, and the question is only
  // whether it has been pointed at somebody.
  const flagged = matches.filter((match) => match.tier === 3);
  const flaggedTokens = flagged
    .map((match) => match.token)
    .filter((token): token is string => token !== undefined);

  const hash = hashBody(forms.squashed);

  if (flagged.length > 0 && isTargeted(forms.tokens, flaggedTokens)) {
    return strikeFor("harassment", clean);
  }

  if (
    flagged.length > 0 &&
    isHounding(context.recent, context.conversationId, context.now)
  ) {
    return strikeFor("harassment", clean);
  }

  if (isDuplicate(context.recent, hash, context.now)) return refuse("duplicate");

  if (isBroadcast(context.recent, hash, context.conversationId, context.now)) {
    return strikeFor("broadcast", clean);
  }

  return {
    allow: true,
    body: SOFTEN_TIER_3 ? soften(clean, flaggedTokens) : clean,
    hash,
    flags: flagged.map((match) => match.term),
    flagged: flagged.length > 0,
  };
}

/**
 * The same screening, for text that is not a message.
 *
 * A group title is read by everyone who sees the group and has no sender, no
 * conversation and no history, so the standing checks, the rate windows and the
 * cross-message rules have nothing to work on. What is left is the part that
 * reads the text itself — shape, lexicon, patterns — and tier three is refused
 * here rather than flagged, because a name is not something you say once. There
 * is no arrangement of words that makes a group called `shitheads` fine.
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

/**
 * Replace the flagged words with their first letter and asterisks.
 *
 * Only reachable when `SOFTEN_TIER_3` is on, which it is not. Kept working so
 * that turning it on is a one-line change rather than a one-line change and
 * then an afternoon, and written against the cleaned text rather than the
 * folded one because the cleaned text is what gets stored.
 */
function soften(clean: string, terms: string[]): string {
  let output = clean;
  for (const term of terms) {
    if (term.includes(" ")) continue;
    const lowered = output.toLowerCase();
    let from = 0;
    for (;;) {
      const at = lowered.indexOf(term, from);
      if (at === -1) break;
      const masked = output[at] + "*".repeat(term.length - 1);
      output = output.slice(0, at) + masked + output.slice(at + term.length);
      from = at + term.length;
    }
  }
  return output;
}
