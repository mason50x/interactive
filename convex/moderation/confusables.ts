/**
 * Characters that are not the letter but look exactly like it.
 *
 * This table is deliberately small, because most of the work is done before it
 * runs. `normalize` applies NFKC first, and NFKC already folds the enormous
 * ranges — fullwidth `ｆｕｃｋ`, the mathematical alphanumerics `𝐟𝐮𝐜𝐤` and
 * `𝖋𝖚𝖈𝖐`, circled `ⓕⓤⓒⓚ`, superscripts — because those are *compatibility*
 * variants of ASCII and Unicode says so.
 *
 * What NFKC will never fold is a character from another script that merely
 * happens to be drawn the same way. Cyrillic `а` is a different letter from
 * Latin `a` and normalising one to the other would be wrong in every context
 * except this one. So that is what is listed here: cross-script lookalikes,
 * Latin letters with strokes, and the small-capital block, mapped to the ASCII
 * letter a reader would see.
 *
 * The cost of a wrong entry is a false positive on someone writing Greek or
 * Russian, which on an English-language chat is a trade worth making and the
 * reason each group is only the characters that are genuinely indistinguishable
 * at reading size.
 */

/**
 * `[ascii, everything that looks like it]`.
 *
 * Written as strings rather than a map literal because the map is built once at
 * module load and this form is the one a human can check against a font.
 */
const GROUPS: [string, string][] = [
  ["a", "аᴀᗅᴬɑɐαАΑÀÁÂÃÄÅĀĂĄǺȀȂ"],
  ["b", "ЬвᏰᴃƄƅᴮβВΒḂḃ"],
  ["c", "сᴄϲҀↃᏟƆСΣÇĆĈĊČ"],
  ["d", "ԁᴅᏧᗪĎĐďđḊ"],
  ["e", "еᴇеЕΕЁÈÉÊËĒĔĖĘĚϵ"],
  ["f", "ƒᶠϝҒḞ"],
  ["g", "ɡᶢԍɢᏻĜĞĠĢ"],
  ["h", "һнᏂᴴΗНĤĦ"],
  ["i", "іɪΙІıϊÌÍÎÏĨĪĬĮİǏ"],
  ["j", "јᴊϳЈĴ"],
  ["k", "кᴋΚКᏦĶ"],
  ["l", "ӏʟᏞΙĹĻĽĿŁ"],
  ["m", "мᴍΜМᏔṀ"],
  ["n", "ոᴎɴΝⲚŃŅŇŊ"],
  ["o", "оᴏοОΟΘθӨΦϕØÒÓÔÕÖŌŎŐǪ0"],
  ["p", "рᴘΡРᏢÞ"],
  ["q", "ԛᶐႭ"],
  ["r", "гʀᏒяЯŔŖŘ"],
  ["s", "ѕꜱՏႽŚŜŞŠ"],
  ["t", "тᴛΤТŢŤŦ"],
  ["u", "цᴜυμՍÙÚÛÜŨŪŬŮŰŲ"],
  ["v", "ѵᴠνᏙѴ"],
  ["w", "ԝᴡѡωШᏔŴ"],
  ["x", "хᕁΧХ"],
  ["y", "уʏγуҮÝŶŸ"],
  ["z", "ᴢΖᏃŹŻŽ"],
  ["ss", "ß"],
  ["ae", "æÆ"],
  ["oe", "œŒ"],
];

/** Built once. A `Map` rather than an object so the keys stay exact. */
const TABLE: Map<string, string> = (() => {
  const table = new Map<string, string>();
  for (const [ascii, lookalikes] of GROUPS) {
    for (const character of lookalikes) table.set(character, ascii);
  }
  return table;
})();

/**
 * Characters that carry no glyph and exist only to sit between other ones.
 *
 * Zero-width spaces and joiners, word joiners, the byte-order mark, soft
 * hyphens, and the Mongolian vowel separator. A message containing them renders
 * identically with them removed, which is the entire reason someone puts them
 * inside a word.
 */
const INVISIBLE = new Set([
  "­", "᠎", "​", "‌", "‍", "‎", "‏",
  "⁠", "⁡", "⁢", "⁣", "⁤", "⁪", "⁫",
  "⁬", "⁭", "⁮", "⁯", "﻿", "ﾠ",
]);

/**
 * Characters that reorder what follows them.
 *
 * These have real uses in real Arabic and Hebrew text and none at all in a
 * message that is otherwise Latin: the reason to embed a right-to-left override
 * in an English sentence is to make it render as something other than what it
 * says. Unlike the invisibles above these are not stripped, they are refused —
 * stripping would silently change the meaning of a legitimately bidirectional
 * message rather than declining to carry it.
 */
const BIDI = new Set([
  "‪", "‫", "‬", "‭", "‮",
  "⁦", "⁧", "⁨", "⁩",
]);

export function foldConfusable(character: string): string | undefined {
  return TABLE.get(character);
}

export function isInvisible(character: string): boolean {
  return INVISIBLE.has(character);
}

export function isBidi(character: string): boolean {
  return BIDI.has(character);
}

/**
 * Tag characters — a deprecated block whose entire remaining use is smuggling
 * an invisible ASCII payload inside an ordinary-looking string.
 */
export function isTagCharacter(codePoint: number): boolean {
  return codePoint >= 0xe0000 && codePoint <= 0xe007f;
}

/**
 * Digits and symbols people substitute for letters.
 *
 * Applied only when building the matching forms, never to the text that gets
 * stored, because `l8r` and `4` are things people write and mean. The cost of
 * folding them is a false positive; the cost of not folding them is that `sh1t`
 * walks straight through, and that is the more expensive mistake.
 *
 * `0` is missing here and lives in the `o` group above instead, so it folds in
 * one place rather than two.
 */
const LEET: Record<string, string> = {
  "1": "i", "!": "i", "|": "l", "3": "e", "4": "a", "@": "a",
  "5": "s", "$": "s", "7": "t", "+": "t", "8": "b", "9": "g",
  "2": "z", "6": "g", "€": "e", "£": "l", "¢": "c",
};

export function foldLeet(character: string): string | undefined {
  return LEET[character];
}
