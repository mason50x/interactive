import {
  foldConfusable,
  foldLeet,
  isBidi,
  isInvisible,
  isTagCharacter,
} from "./confusables";
import { MAX_CHAR_RUN, MAX_COMBINING_RUN, MAX_NEWLINES, MIN_BODY } from "./limits";

/**
 * Turning what someone typed into the two strings the rules can reason about.
 *
 * Every evasion this system has to survive is a way of writing a word so that a
 * human still reads it and a naive `includes` does not: `fuuuck`, `f.u.c.k`,
 * `f u c k`, `sh1t`, `𝖋𝖚𝖈𝖐`, `fυck` with a Greek upsilon, `fu​ck` with a
 * zero-width space wedged in the middle. Handling each of those as its own rule
 * is a losing game, because there are more of them than anyone will think of.
 * Handling them as one *shape* problem is winnable: fold everything to a
 * canonical form first, and then the rules only ever have to know one spelling.
 *
 * ## The two forms, and why there are two
 *
 * `tokens` keeps word boundaries. It is what ordinary matching runs against,
 * and boundaries are what stop `class` from containing a slur.
 *
 * `squashed` throws the boundaries away, so `f.u.c.k` and `f u c k` both become
 * one run of letters. That catches the separator trick — and on its own it
 * would also catch Scunthorpe, Penistone and assassin, which is the classic way
 * this kind of filter embarrasses itself.
 *
 * The fix is `sepBefore`, which remembers where the separators *were*. A hit in
 * `squashed` only counts when the span it matched had a separator inside it —
 * that is, when squashing was necessary to find it. `f.u.c.k` needed squashing.
 * `Scunthorpe` did not, because it was already one word, so it is left alone.
 * One array, and the whole class of false positives goes away without a list of
 * exceptions that grows forever.
 *
 * ## Stretching is handled by the matcher, not here
 *
 * Nothing collapses repeated letters. It is tempting — `fuuuck` to `fuck` looks
 * like the same fold as everything else — but collapsing runs makes `ass` and
 * `as` the same string, and `as` is a word people use constantly. So runs are
 * left intact and `matchRuns` compares them length-aware instead: a term's run
 * of two `s` needs at least two in the text, which `ass` has and `as` does not,
 * while `aaassss` still matches. See `matchRuns`.
 */

/** Why a message was refused before any rule looked at what it said. */
export type ShapeReason =
  | "empty"
  | "too-long"
  | "hidden-characters"
  | "reordering"
  | "stacked-marks"
  | "too-many-lines";

/** The forms every rule reads. Built once per message. */
export type Forms = {
  /** Word-boundary matching. Folded, lowercased, split on everything else. */
  tokens: string[];
  /** The same characters with the boundaries removed. */
  squashed: string;
  /** `sepBefore[i]` — a separator was dropped immediately before `squashed[i]`. */
  sepBefore: boolean[];
  /** `squashed`, run-length encoded, so the matcher does it once. */
  runs: Run[];
};

export type Prepared =
  | { ok: false; reason: ShapeReason }
  | { ok: true; clean: string; forms: Forms };

const COMBINING = /\p{M}/u;

/**
 * Control characters with no business in a message.
 *
 * Tab and newline are the two that do, and they survive. Everything else in C0
 * and C1 is a terminal instruction from the 1960s and its only modern use is
 * making a stored string render as something other than what it is.
 */
function isControl(codePoint: number): boolean {
  if (codePoint === 0x09 || codePoint === 0x0a) return false;
  return codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f);
}

/**
 * What actually gets stored, and what the rules then read.
 *
 * These are the same string on purpose. Screening one version of a message and
 * storing another is how a filter gets walked past: whatever the reader ends up
 * seeing is the thing that needed checking, so the invisible characters come
 * out *before* the check rather than after it.
 *
 * `maxBody` arrives from the caller because it depends on the surface — see
 * `MAX_BODY` in `convex/moderation/limits.ts` — and it is checked early, before
 * any pattern runs, because a mutation has one second to finish and the
 * cheapest defence against a pathological input is never to have accepted a
 * long one.
 */
export function prepare(raw: string, maxBody: number): Prepared {
  const source = raw.normalize("NFC");
  if (source.length > maxBody * 4) return { ok: false, reason: "too-long" };

  const kept: string[] = [];
  let combiningRun = 0;
  let newlines = 0;
  let previous = "";
  let charRun = 0;

  for (const character of source) {
    const codePoint = character.codePointAt(0) ?? 0;

    if (isBidi(character) || isTagCharacter(codePoint)) {
      return { ok: false, reason: "reordering" };
    }
    if (isInvisible(character)) continue;
    if (isControl(codePoint)) continue;

    if (COMBINING.test(character)) {
      combiningRun += 1;
      if (combiningRun > MAX_COMBINING_RUN) {
        return { ok: false, reason: "stacked-marks" };
      }
    } else {
      combiningRun = 0;
    }

    if (character === "\n") {
      newlines += 1;
      if (newlines > MAX_NEWLINES) return { ok: false, reason: "too-many-lines" };
    }

    // A long run is trimmed rather than refused. Two hundred exclamation marks
    // is someone being loud, not someone being clever, and the message reads
    // the same at sixteen.
    if (character === previous) {
      charRun += 1;
      if (charRun >= MAX_CHAR_RUN) continue;
    } else {
      charRun = 0;
      previous = character;
    }

    kept.push(character);
  }

  const clean = kept.join("").trim();
  if (clean.length < MIN_BODY) return { ok: false, reason: "empty" };
  if (clean.length > maxBody) return { ok: false, reason: "too-long" };

  return { ok: true, clean, forms: buildForms(clean) };
}

/**
 * Fold the cleaned text down to letters and digits.
 *
 * NFKC first, because it does most of the work for free: fullwidth, the
 * mathematical alphanumerics, circled letters and superscripts are all
 * *compatibility* variants of ASCII and Unicode already knows it. Then NFD and
 * drop the combining marks, which folds every accent. Only then the table in
 * `confusables.ts`, which has to exist because a Cyrillic `а` is a genuinely
 * different letter and no normalisation form will ever say otherwise.
 */
export function buildForms(clean: string): Forms {
  const folded = clean
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

  const tokens: string[] = [];
  const squashedParts: string[] = [];
  const sepBefore: boolean[] = [];

  let token = "";
  let pendingSeparator = false;

  for (const character of folded) {
    const mapped = foldConfusable(character) ?? foldLeet(character) ?? character;

    // A confusable can fold to more than one letter (`ß` to `ss`), so this
    // walks the result rather than assuming a single character came back.
    for (const letter of mapped) {
      if (/[a-z0-9]/.test(letter)) {
        token += letter;
        squashedParts.push(letter);
        sepBefore.push(pendingSeparator);
        pendingSeparator = false;
      } else {
        if (token !== "") {
          tokens.push(token);
          token = "";
        }
        pendingSeparator = true;
      }
    }
  }
  if (token !== "") tokens.push(token);

  const squashed = squashedParts.join("");
  return { tokens, squashed, sepBefore, runs: encodeRuns(squashed) };
}

/** One run of the same character: the letter, and how many of it. */
export type Run = { character: string; length: number; at: number };

export function encodeRuns(value: string): Run[] {
  const runs: Run[] = [];
  let index = 0;
  while (index < value.length) {
    const character = value[index];
    let length = 1;
    while (index + length < value.length && value[index + length] === character) {
      length += 1;
    }
    runs.push({ character, length, at: index });
    index += length;
  }
  return runs;
}

/**
 * Where `term` occurs in `haystack`, allowing any letter to be stretched.
 *
 * Both sides are run-length encoded, and a run in the text matches a run in the
 * term when the characters agree and the text has *at least* as many. That one
 * asymmetry is the whole trick: `fuck` is found inside `fuuuuck` and `ffuck`,
 * while `ass` is not found inside `as`, because `as` is one `s` short of the
 * two the term needs. Collapsing runs instead would have made those two strings
 * identical and put a filter on the word `as`.
 *
 * Returns `[start, end)` into the *unencoded* haystack, or `null`.
 */
export function matchRuns(
  haystackRuns: Run[],
  termRuns: Run[],
  from = 0,
): { start: number; end: number } | null {
  if (termRuns.length === 0) return null;

  for (let offset = from; offset + termRuns.length <= haystackRuns.length; offset += 1) {
    let matched = true;
    for (let step = 0; step < termRuns.length; step += 1) {
      const inText = haystackRuns[offset + step];
      const inTerm = termRuns[step];
      // Interior runs of the term must be met exactly in kind and at least in
      // length. The first and last are no different — a term is only ever asked
      // to appear whole.
      if (inText.character !== inTerm.character || inText.length < inTerm.length) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;

    const first = haystackRuns[offset];
    const last = haystackRuns[offset + termRuns.length - 1];
    return { start: first.at, end: last.at + last.length };
  }
  return null;
}

/** Whether a token begins with `term`, stretching allowed. Catches suffixes. */
export function tokenStartsWith(token: string, termRuns: Run[]): boolean {
  const found = matchRuns(encodeRuns(token), termRuns, 0);
  return found !== null && found.start === 0;
}
