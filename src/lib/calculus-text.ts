/**
 * Number and expression formatting shared by the calculus puzzles' server
 * (`convex/calculus.ts`, which words the worked solutions) and browser
 * (`src/components/app/calculus/problems.tsx`, which words the questions), so
 * both sides print a polynomial or a fraction the same way. Nothing here
 * knows an answer.
 */

export const MINUS = "−";

const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "-": "⁻",
  "−": "⁻",
  "(": "⁽",
  ")": "⁾",
  "+": "⁺",
  x: "ˣ",
  n: "ⁿ",
  t: "ᵗ",
  k: "ᵏ",
};

/** `sup("2x")` is "²ˣ"; anything without a superscript form stays as is. */
export const sup = (s: string | number) =>
  String(s)
    .split("")
    .map((ch) => SUPERSCRIPT[ch] ?? ch)
    .join("");

/** To three decimal places, trailing zeros dropped, with a real minus sign. */
export function fmt(n: number): string {
  const rounded = Math.round(n * 1000) / 1000;
  const text = Object.is(rounded, -0) ? "0" : String(rounded);
  return text.replace("-", MINUS);
}

/** e to the power qx: "eˣ", "e⁻ˣ", "e²ˣ". */
export const expo = (q: number) =>
  `e${sup(q === 1 ? "x" : q === -1 ? "-x" : `${q}x`)}`;

/** A power with the exponent 1 left off: `power("x", 1)` is "x". */
export const power = (base: string, n: number) =>
  n === 1 ? base : `${base}${sup(n)}`;

/** `fmt`, with brackets when negative, for slotting into an expression. */
export const paren = (n: number) => (n < 0 ? `(${fmt(n)})` : fmt(n));

/**
 * A number as it would be written down: exact as a fraction when it is one
 * with a small denominator, and to three decimal places either way.
 */
export function show(n: number): string {
  if (Number.isInteger(n)) return fmt(n);
  for (let d = 2; d <= 64; d++) {
    const p = Math.round(n * d);
    if (Math.abs(p / d - n) < 1e-9) return `${fmt(p)}/${d} ≈ ${fmt(n)}`;
  }
  return fmt(n);
}

/**
 * A sum of terms, each a coefficient and a monomial like "x²" or "" for a
 * constant, written the way a textbook would: "2x³ − x + 4". Zero terms
 * drop out and a lone zero prints as "0".
 */
export function terms(list: readonly (readonly [number, string])[]): string {
  let out = "";
  for (const [coefficient, monomial] of list) {
    if (coefficient === 0) continue;
    const magnitude = Math.abs(coefficient);
    const body =
      monomial === "" || magnitude !== 1 ? fmt(magnitude) + monomial : monomial;
    if (out === "") out = coefficient < 0 ? `${MINUS}${body}` : body;
    else out += coefficient < 0 ? ` ${MINUS} ${body}` : ` + ${body}`;
  }
  return out || "0";
}

/** A polynomial from ascending coefficients: `poly([6, -5, -2, 1])`. */
export function poly(coefficients: readonly number[], variable = "x"): string {
  const list: [number, string][] = [];
  for (let k = coefficients.length - 1; k >= 0; k--) {
    const monomial = k === 0 ? "" : k === 1 ? variable : variable + sup(k);
    list.push([coefficients[k], monomial]);
  }
  return terms(list);
}

/** The value of a polynomial from ascending coefficients. */
export const polyAt = (coefficients: readonly number[], x: number) =>
  coefficients.reduce((sum, c, k) => sum + c * x ** k, 0);

/** The slope rule of an Euler's-method puzzle, e.g. "x − 2y + xy". */
export const eulerRule = (p: number, q: number, r: number) =>
  terms([
    [p, "x"],
    [q, "y"],
    [r, "xy"],
  ]);

/** The one side of an implicit curve that carries the constant. */
export const withConstant = (lead: string, c: number) =>
  c === 0
    ? lead
    : c < 0
      ? `${lead} ${MINUS} ${fmt(-c)}`
      : `${lead} + ${fmt(c)}`;

/**
 * What a typed answer is worth: a decimal, or a fraction like "200/27",
 * since exact answers often come out as one and the grader only wants the
 * value. A typographic minus, spaces and a trailing unit are tolerated;
 * anything else is not an answer.
 */
export function parseAnswer(text: string): number | null {
  const cleaned = text
    .replace(/[−–]/g, "-")
    .replace(/\s+/g, "")
    .replace(/(π|pi|units?²?)$/i, "");
  const number = /^[-+]?(\d+\.?\d*|\.\d+)$/;
  const parts = cleaned.split("/");
  if (parts.length > 2 || !parts.every((part) => number.test(part)))
    return null;
  const value =
    parts.length === 2 ? Number(parts[0]) / Number(parts[1]) : Number(parts[0]);
  return Number.isFinite(value) ? value : null;
}
