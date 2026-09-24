import { v, type Infer } from "convex/values";

/**
 * The timeout-screen geometry puzzles, server side.
 *
 * A puzzle leaves here as its givens only. The answer and the worked solution
 * stay on the server until the guess is in, so neither the network response
 * nor the client bundle can hand one over. The browser draws the figure from
 * the same givens (see `src/components/app/geometry/problems.tsx`).
 */

export const PARALLEL_RELATIONSHIPS = [
  "corresponding",
  "alternate",
  "co-interior",
  "vertical",
] as const;

export const puzzleParams = v.union(
  v.object({ kind: v.literal("triangle"), a: v.number(), b: v.number() }),
  v.object({
    kind: v.literal("pythagoras"),
    mode: v.literal("hypotenuse"),
    a: v.number(),
    b: v.number(),
  }),
  v.object({
    kind: v.literal("pythagoras"),
    mode: v.literal("leg"),
    a: v.number(),
    c: v.number(),
  }),
  v.object({
    kind: v.literal("circle"),
    mode: v.union(v.literal("area"), v.literal("circumference")),
    r: v.number(),
  }),
  v.object({
    kind: v.literal("inscribed"),
    mode: v.literal("inscribed"),
    central: v.number(),
    /** Where P sits on the upper arc, in degrees off the top. */
    p: v.number(),
  }),
  v.object({
    kind: v.literal("inscribed"),
    mode: v.literal("central"),
    inscribed: v.number(),
    p: v.number(),
  }),
  v.object({ kind: v.literal("polygon"), n: v.number() }),
  v.object({
    kind: v.literal("parallel"),
    relationship: v.union(
      ...PARALLEL_RELATIONSHIPS.map((name) => v.literal(name)),
    ),
    known: v.number(),
  }),
  v.object({
    kind: v.literal("trapezoid"),
    top: v.number(),
    base: v.number(),
    height: v.number(),
    /** How far along the spare base the top starts, from 0 to 1. */
    offset: v.number(),
  }),
  v.object({
    kind: v.literal("similar"),
    base: v.number(),
    left: v.number(),
    right: v.number(),
    bigBase: v.number(),
  }),
  v.object({ kind: v.literal("shaded"), side: v.number() }),
);

export type PuzzleParams = Infer<typeof puzzleParams>;

type Rng = () => number;
const int = (rng: Rng, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1));
const pick = <T>(rng: Rng, items: readonly T[]) =>
  items[Math.floor(rng() * items.length)];
const fmt = (n: number) =>
  Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);

const GENERATORS: readonly ((rng: Rng) => PuzzleParams)[] = [
  (rng) => {
    const a = int(rng, 40, 75);
    return { kind: "triangle", a, b: Math.min(int(rng, 40, 75), 150 - a) };
  },
  (rng) => {
    const t = pick(rng, [
      [3, 4, 5],
      [6, 8, 10],
      [5, 12, 13],
      [8, 15, 17],
      [9, 12, 15],
      [12, 16, 20],
    ] as const);
    const [a, b] = rng() < 0.5 ? [t[0], t[1]] : [t[1], t[0]];
    return rng() < 0.6
      ? { kind: "pythagoras", mode: "hypotenuse", a, b }
      : { kind: "pythagoras", mode: "leg", a, c: t[2] };
  },
  (rng) => ({
    kind: "circle",
    mode: rng() < 0.5 ? "area" : "circumference",
    r: int(rng, 2, 9),
  }),
  (rng) => {
    const central = 2 * int(rng, 30, 80);
    const p = int(rng, -35, 35);
    return rng() < 0.6
      ? { kind: "inscribed", mode: "inscribed", central, p }
      : { kind: "inscribed", mode: "central", inscribed: central / 2, p };
  },
  (rng) => ({ kind: "polygon", n: pick(rng, [5, 6, 8, 9, 10, 12] as const) }),
  (rng) => {
    let tilt = int(rng, 40, 140);
    if (Math.abs(tilt - 90) < 12) tilt += tilt < 90 ? -12 : 12;
    const relationship = pick(rng, PARALLEL_RELATIONSHIPS);
    // Corresponding and vertical start from the upper-right angle, which is
    // the tilt; the other two start from the lower-right, its supplement.
    const known =
      relationship === "corresponding" || relationship === "vertical"
        ? tilt
        : 180 - tilt;
    return { kind: "parallel", relationship, known };
  },
  (rng) => {
    const top = int(rng, 4, 10);
    const base = top + int(rng, 2, 6);
    let height = int(rng, 3, 8);
    if (((top + base) * height) % 2 === 1) height += 1;
    return {
      kind: "trapezoid",
      top,
      base,
      height,
      offset: Math.round((0.25 + rng() * 0.5) * 100) / 100,
    };
  },
  (rng) => {
    const [base, left, right] = pick(rng, [
      [4, 6, 7],
      [3, 5, 6],
      [5, 6, 8],
      [4, 5, 7],
      [6, 4, 5],
    ] as const);
    const k = pick(rng, [1.5, 2, 2.5, 3] as const);
    return { kind: "similar", base, left, right, bigBase: base * k };
  },
  (rng) => ({ kind: "shaded", side: 2 * int(rng, 2, 7) }),
];

/** A fresh puzzle of a different kind from `previous`, when there is one. */
export function generatePuzzle(
  previous?: PuzzleParams["kind"],
  rng: Rng = Math.random,
): PuzzleParams {
  for (;;) {
    const params = pick(rng, GENERATORS)(rng);
    if (params.kind !== previous) return params;
  }
}

export type Solution = {
  answer: number;
  /** How far off a guess may be and still count. */
  tolerance: number;
  /** The answer as it should read, with its unit. */
  display: string;
  working: string;
};

const RULES = {
  corresponding: "Corresponding angles are equal",
  alternate: "Alternate interior angles are equal",
  "co-interior": "Co-interior angles add up to 180°",
  vertical: "Vertically opposite angles are equal",
} as const;

export function solve(params: PuzzleParams): Solution {
  const exact = (answer: number, unit: string, working: string) => ({
    answer,
    tolerance: 0.01,
    display: `${fmt(answer)}${unit}`,
    working,
  });
  switch (params.kind) {
    case "triangle": {
      const c = 180 - params.a - params.b;
      return exact(c, "°", `180° − ${params.a}° − ${params.b}° = ${c}°`);
    }
    case "pythagoras": {
      if (params.mode === "hypotenuse") {
        const sum = params.a ** 2 + params.b ** 2;
        return exact(
          Math.sqrt(sum),
          "",
          `√(${params.a}² + ${params.b}²) = √${sum} = ${Math.sqrt(sum)}`,
        );
      }
      const diff = params.c ** 2 - params.a ** 2;
      return exact(
        Math.sqrt(diff),
        "",
        `√(${params.c}² − ${params.a}²) = √${diff} = ${Math.sqrt(diff)}`,
      );
    }
    case "circle":
      return params.mode === "area"
        ? exact(
            params.r ** 2,
            "π",
            `π × ${params.r}² = ${params.r ** 2}π`,
          )
        : exact(
            2 * params.r,
            "π",
            `2 × π × ${params.r} = ${2 * params.r}π`,
          );
    case "inscribed":
      return params.mode === "inscribed"
        ? exact(
            params.central / 2,
            "°",
            `${params.central}° ÷ 2 = ${params.central / 2}°`,
          )
        : exact(
            params.inscribed * 2,
            "°",
            `${params.inscribed}° × 2 = ${params.inscribed * 2}°`,
          );
    case "polygon": {
      const angle = (180 * (params.n - 2)) / params.n;
      return exact(
        angle,
        "°",
        `(${params.n} − 2) × 180° ÷ ${params.n} = ${angle}°`,
      );
    }
    case "parallel": {
      if (params.relationship === "co-interior") {
        const answer = 180 - params.known;
        return exact(answer, "°", `180° − ${params.known}° = ${answer}°`);
      }
      return exact(
        params.known,
        "°",
        `${RULES[params.relationship]}, so ? = ${params.known}°`,
      );
    }
    case "trapezoid": {
      const area = ((params.top + params.base) * params.height) / 2;
      return exact(
        area,
        " units²",
        `(${params.top} + ${params.base}) ÷ 2 × ${params.height} = ${area}`,
      );
    }
    case "similar": {
      const k = params.bigBase / params.base;
      const answer = params.left * k;
      return exact(
        answer,
        "",
        `${fmt(params.bigBase)} ÷ ${params.base} = ${fmt(k)}, and ${params.left} × ${fmt(k)} = ${fmt(answer)}`,
      );
    }
    case "shaded": {
      const r = params.side / 2;
      const circle = Math.PI * r * r;
      const answer = Math.round((params.side ** 2 - circle) * 10) / 10;
      return {
        answer,
        // Room for π ≈ 3.14 and for rounding at a different step.
        tolerance: Math.max(0.1, answer * 0.006),
        display: `${answer} units²`,
        working: `${params.side}² − π × ${fmt(r)}² ≈ ${params.side ** 2} − ${fmt(circle)} ≈ ${answer}`,
      };
    }
  }
}

export function isCorrect(params: PuzzleParams, guess: number) {
  const { answer, tolerance } = solve(params);
  return Number.isFinite(guess) && Math.abs(guess - answer) <= tolerance;
}
