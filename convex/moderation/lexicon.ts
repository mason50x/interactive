import { encodeRuns, matchRuns, tokenStartsWith, type Forms, type Run } from "./normalize";

/**
 * The words, and what each one costs.
 *
 * ## This file must never reach a browser
 *
 * It is the reason the whole moderation system lives under `convex/` rather
 * than in `src/lib/`. Convex bundles this directory for its own runtime and
 * Next never sees it; the client reaches Convex only through
 * `convex/_generated/api`, which is names and types and no bodies. So the list
 * below ships to a server and nowhere else, and a curious teenager reading the
 * page source finds nothing — which matters both because the list is unpleasant
 * and because a published filter is a published set of instructions for
 * evading it.
 *
 * Two things hold that line. An ESLint rule forbids `src/**` from importing
 * anything under `convex/moderation`, and every refusal that crosses the wire
 * is a category (`"slur"`, `"contact"`) rather than the term that matched, so
 * the composer cannot be used as an oracle to enumerate this file one guess at
 * a time.
 *
 * ## Terms are whole words
 *
 * Not stems. `tokenStartsWith` already catches every suffix — one entry for
 * `fuck` covers `fucking`, `fucker`, `fucked` — so a stem buys nothing and
 * costs a great deal: `nig` as an entry would flag `night`, `nigeria` and
 * `niggle`, and the allowlist needed to rescue them would be longer than this
 * file. Complete words, and the matcher does the rest.
 *
 * ## The three tiers
 *
 * Tier one is refused and struck hard: slurs, sexual content, sexual interest
 * in minors, credible threats. A named few are `banOnSight` and skip the ladder
 * entirely, because there is no count of them that should have been tolerated.
 *
 * Tier two is refused and struck moderately: telling someone to kill
 * themselves, and threats to expose them.
 *
 * Tier three is *allowed* and merely recorded. This is the deliberate one. The
 * audience is thirteen and up, they swear, and a chat that refuses `shit` is a
 * chat they route around within a day. The flag is not wasted: the targeting
 * rule in `convex/moderation/rules.ts` reads it, which is how `this is shit`
 * stays fine and `you are shit`, three times in ten minutes, does not.
 */

export type Category =
  | "slur"
  | "sexual"
  | "exploitation"
  | "threat"
  | "self-harm"
  | "degrading"
  | "profanity";

export type Tier = 1 | 2 | 3;

type Source = {
  category: Category;
  tier: Tier;
  banOnSight?: boolean;
  terms: string[];
};

/**
 * Slurs. Tier one throughout, and the racial and anti-gay ones are the subset
 * that bans on sight: there is no number of times somebody says one of these
 * that a room of teenagers should have had to sit through first.
 */
const SLURS_SEVERE: Source = {
  category: "slur",
  tier: 1,
  banOnSight: true,
  terms: [
    "nigger", "nigga", "niggers", "niggas", "negro",
    "faggot", "faggots", "fag", "fags", "dyke", "dykes",
    "tranny", "trannies", "shemale",
    "kike", "kikes", "spic", "spics", "wetback", "wetbacks",
    "chink", "chinks", "gook", "gooks", "coon", "coons",
    "raghead", "towelhead", "sandnigger", "beaner", "beaners",
    "paki", "pakis", "abo", "abos", "gypo", "gyppo",
    "retard", "retards", "retarded", "tard", "tards",
  ],
};

/**
 * The same class of word, one step down: still refused, still struck heavily,
 * but not on its own worth ending an account over. Mostly the softened or
 * ambiguous forms, and the ones that are genuinely used as insults rather than
 * as identifiers.
 */
const SLURS: Source = {
  category: "slur",
  tier: 1,
  terms: [
    "queer", "homo", "fairy", "poof", "poofter", "batty",
    "midget", "cripple", "spastic", "spaz", "mongoloid",
    "wop", "dago", "mick", "kraut", "jap", "slant",
    "redskin", "injun", "halfbreed",
    "cracker", "honky", "whitey",
    "hitler", "nazi", "nazis", "heil", "gaschamber", "holocaust",
    "whitepower", "whitepride", "kkk", "klan",
  ],
};

/**
 * Sexual content. Refused everywhere, including in a private message, because
 * a private message is where every version of this problem starts and the two
 * accounts on either side of one are not reliably who they say they are.
 */
const SEXUAL: Source = {
  category: "sexual",
  tier: 1,
  terms: [
    "porn", "porno", "pornhub", "xvideos", "xnxx", "onlyfans", "rule34",
    "hentai", "nudes", "nude", "naked", "nsfw", "sext", "sexting",
    "blowjob", "handjob", "rimjob", "creampie", "cumshot", "bukkake",
    "anal", "deepthroat", "gangbang", "threesome", "orgy", "orgasm",
    "masturbate", "masturbating", "jerkoff", "fingering", "scissoring",
    "dildo", "buttplug", "fleshlight", "vibrator",
    "cock", "dick", "penis", "cocks", "dicks",
    "pussy", "vagina", "clit", "clitoris", "labia",
    "tits", "titties", "boobs", "boobies", "nipples",
    "cum", "cumming", "jizz", "semen", "precum",
    "horny", "milf", "dilf", "hentai", "ahegao",
    "whore", "whores", "slut", "sluts", "hoe", "hoes", "thot", "thots",
    "prostitute", "hooker", "escort",
    "rape", "raped", "rapist", "molest", "molested", "molester",
  ],
};

/**
 * Sexual interest in minors, and the vocabulary that exists to arrange it.
 *
 * Every one of these bans on sight and none of them is a judgement call. The
 * combination rules in `convex/moderation/rules.ts` do the harder half of this
 * job — an ordinary sexual term next to an age is the shape that actually
 * turns up — and these are the terms that need no context at all.
 */
const EXPLOITATION: Source = {
  category: "exploitation",
  tier: 1,
  banOnSight: true,
  terms: [
    "cp", "childporn", "childpornography", "kiddieporn", "jailbait",
    "loli", "lolicon", "shota", "shotacon", "pedo", "pedophile",
    "paedo", "paedophile", "hebephile", "mapminor",
    "cheesepizza", "underagenudes",
  ],
};

/**
 * Threats. Tier one, and the explicit ones ban on sight.
 *
 * Deliberately narrow. `i will kill you` is a threat and `this game is killing
 * me` is not, and the difference is a second-person object, so most of the work
 * here is done as phrases rather than as words. A wider list would catch every
 * teenager describing a video game.
 */
const THREATS: Source = {
  category: "threat",
  tier: 1,
  banOnSight: true,
  terms: [
    "i will kill you", "im going to kill you", "i am going to kill you",
    "imma kill you", "i will murder you", "i will stab you",
    "i will shoot you", "im going to shoot you",
    "i know where you live", "i will find you and kill you",
    "school shooting", "school shooter", "shoot up the school",
    "im bringing a gun", "bomb threat",
  ],
};

/**
 * Telling somebody to end their life, in the forms it is actually written in.
 *
 * Tier two rather than tier one, and refused rather than banned, which is a
 * considered position: this is overwhelmingly said by fourteen-year-olds who
 * have absorbed it as a way of saying "shut up" and who stop when something
 * stops them. Refusing it and striking it is what stops them. Banning on the
 * first one would remove a great many children who are not the problem, and the
 * ladder catches anybody who turns out to be.
 */
const SELF_HARM: Source = {
  category: "self-harm",
  tier: 2,
  terms: [
    "kys", "kysm", "kill yourself", "kill your self", "killurself",
    "go kill yourself", "you should kill yourself",
    "end yourself", "end your life", "off yourself",
    "hang yourself", "neck yourself", "go neck yourself",
    "slit your wrists", "cut yourself", "drink bleach",
    "go die", "just die", "you should die", "i hope you die",
    "nobody would miss you", "no one would miss you",
    "the world would be better without you",
  ],
};

/** Threats to expose somebody, which on this site is the live one. */
const DEGRADING: Source = {
  category: "degrading",
  tier: 2,
  terms: [
    "dox", "doxx", "doxxed", "doxxing",
    "i will dox you", "im going to dox you",
    "i have your address", "i have your ip",
    "swat", "swatting", "i will swat you",
    "leak your nudes", "send your nudes to",
  ],
};

/**
 * Ordinary profanity. Allowed, recorded, and never on its own a strike.
 *
 * See the note at the top of this file for why. `SOFTEN_TIER_3` in
 * `convex/moderation/limits.ts` will mask these instead if that turns out to be
 * wrong, and it ships off.
 */
const PROFANITY: Source = {
  category: "profanity",
  tier: 3,
  terms: [
    "fuck", "fucks", "fucking", "fucker", "motherfucker", "fuk", "fck",
    "shit", "shits", "bullshit", "shitty", "crap",
    "bitch", "bitches", "bitching",
    "ass", "asses", "asshole", "arse", "arsehole", "jackass", "dumbass",
    "bastard", "damn", "goddamn", "dammit",
    "piss", "pissed", "pissing",
    "twat", "wanker", "wank", "prick", "knob", "bollocks", "bugger",
    "douche", "douchebag", "scumbag",
    "idiot", "moron", "stupid", "dumb", "loser", "freak", "ugly",
    "hate you", "shut up", "nobody likes you", "kill me",
  ],
};

const SOURCES = [
  SLURS_SEVERE,
  SLURS,
  SEXUAL,
  EXPLOITATION,
  THREATS,
  SELF_HARM,
  DEGRADING,
  PROFANITY,
];

/**
 * Ordinary words that begin with a term above.
 *
 * Short only because terms are whole words. Every entry here is a word that
 * genuinely starts with a listed one — `assassin` with `ass`, `analysis` with
 * `anal`, `cocktail` with `cock` — and would otherwise be refused. The list of
 * words that merely *contain* a term is far longer and needs nothing, because
 * matching is anchored to the start of a token: `class` and `Scunthorpe` never
 * come near this.
 */
const HOSTS = new Set([
  "assassin", "assassins", "assassinate", "assassination",
  "assault", "assaulted", "assemble", "assembly", "assert", "assertion",
  "assess", "assessed", "assessment", "asset", "assets", "assign",
  "assigned", "assignment", "assist", "assistant", "assistance",
  "associate", "associated", "association", "assorted", "assume",
  "assumed", "assumption", "assure", "assured", "assyrian",
  "analysis", "analyse", "analyze", "analyzed", "analyst", "analytic",
  "analytics", "analog", "analogue", "analogy", "analogous",
  "cocktail", "cocktails", "cockpit", "cockroach", "cockney", "cocker",
  "cumulative", "cumin", "cumbersome", "cumulus", "cumberland",
  "dickens", "dickinson", "dictionary", "dictate",
  "penistone", "peninsula",
  "sextet", "sextant", "sexton", "sussex", "essex", "middlesex",
  "titan", "titanic", "title", "titles", "titular", "tithe", "titration",
  "shiitake", "shitake",
  "arsenal", "arsenic", "arsenals",
  "hello", "hellenic", "hellman",
  "nigeria", "nigerian", "niger", "niggle", "niggling",
  "crapshoot",
  "homogeneous", "homograph", "homophone", "homonym", "homogenous",
  "queerly",
  "damnation",
  "pissarro",
  "bassoon",
]);

/** A compiled entry. Terms are encoded once at module load, never per message. */
type Entry = {
  term: string;
  category: Category;
  tier: Tier;
  banOnSight: boolean;
  /** A phrase matches without the boundary test — see `scan`. */
  phrase: boolean;
  runs: Run[];
};

/**
 * Terms indexed by the letter they start with.
 *
 * A message is scanned position by position, and at each position only the
 * terms beginning with the letter actually there are tried. Without this the
 * cost is every term against every position, which on a two-thousand-character
 * message and three hundred terms is the kind of arithmetic that ends in a
 * mutation hitting its one-second limit and the message never sending at all.
 */
const BY_FIRST_LETTER: Map<string, Entry[]> = (() => {
  const index = new Map<string, Entry[]>();
  for (const source of SOURCES) {
    for (const term of source.terms) {
      const squashed = term.replace(/[^a-z0-9]/g, "");
      if (squashed === "") continue;
      const entry: Entry = {
        term,
        category: source.category,
        tier: source.tier,
        banOnSight: source.banOnSight ?? false,
        phrase: /\s/.test(term),
        runs: encodeRuns(squashed),
      };
      const letter = squashed[0];
      const bucket = index.get(letter);
      if (bucket === undefined) index.set(letter, [entry]);
      else bucket.push(entry);
    }
  }
  return index;
})();

/** Every entry, for the token pass, which walks words rather than positions. */
const ALL: Entry[] = [...BY_FIRST_LETTER.values()].flat();

/** One term found in one message. */
export type Match = {
  term: string;
  category: Category;
  tier: Tier;
  banOnSight: boolean;
  /** It was only found once the separators were taken out. */
  obfuscated: boolean;
  /** The token it was found in, when it was found as a word. */
  token?: string;
};

/**
 * Every term in a message, each reported once.
 *
 * Two passes, and the difference between them is the whole Scunthorpe
 * argument. The first walks the message's words and asks whether any of them
 * *begins* with a term, skipping the words in `HOSTS`. The second walks the
 * message with its separators removed and asks whether a term appears there —
 * but only counts a hit if a separator was actually inside the span it matched,
 * which means the only thing the second pass can find is somebody who broke a
 * word up on purpose.
 *
 * Phrases skip the second test, because a phrase always has separators in it
 * and requiring one to be suspicious would refuse every phrase ever written.
 */
export function scan(forms: Forms): Match[] {
  const found = new Map<string, Match>();

  for (const token of forms.tokens) {
    if (HOSTS.has(token)) continue;
    for (const entry of ALL) {
      if (entry.phrase) continue;
      if (found.has(entry.term)) continue;
      if (tokenStartsWith(token, entry.runs)) {
        found.set(entry.term, {
          term: entry.term,
          category: entry.category,
          tier: entry.tier,
          banOnSight: entry.banOnSight,
          obfuscated: false,
          token,
        });
      }
    }
  }

  for (let position = 0; position < forms.runs.length; position += 1) {
    const bucket = BY_FIRST_LETTER.get(forms.runs[position].character);
    if (bucket === undefined) continue;

    for (const entry of bucket) {
      if (found.has(entry.term)) continue;
      const span = matchRuns(forms.runs, entry.runs, position);
      if (span === null || span.start !== forms.runs[position].at) continue;

      if (!entry.phrase) {
        // Only a hit if taking the separators out is what revealed it. A word
        // that was already whole was the first pass's business, and it either
        // caught it or decided the host word was innocent.
        let broken = false;
        for (let index = span.start + 1; index < span.end; index += 1) {
          if (forms.sepBefore[index]) {
            broken = true;
            break;
          }
        }
        if (!broken) continue;
      }

      found.set(entry.term, {
        term: entry.term,
        category: entry.category,
        tier: entry.tier,
        banOnSight: entry.banOnSight,
        obfuscated: !entry.phrase,
      });
    }
  }

  return [...found.values()];
}

/**
 * Whether a handle may be claimed.
 *
 * A handle is a message that everyone in every room reads every time its owner
 * says anything, so it is held to tier three as well as tiers one and two —
 * `fuckyou` is a fine thing to say and not a fine thing to be called.
 */
export function handleIsClean(forms: Forms): boolean {
  return scan(forms).length === 0;
}
