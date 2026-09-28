/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  BOX_SHEETS,
  PUZZLE_KINDS,
  TOLERANCE,
  bestCut,
  generatePuzzle,
  isCurrentPuzzle,
  solve,
  type PuzzleParams,
} from "../../convex/calculus";
import {
  FigureFrame,
  describePuzzle,
} from "../../src/components/app/calculus/problems";
import {
  fmt,
  parseAnswer,
  poly,
  show,
  sup,
  terms,
} from "../../src/lib/calculus-text";

/**
 * Every closed-form answer in `solve` checked against a numerical method
 * that knows nothing of the closed form: Simpson's rule for the integrals,
 * central differences for the derivatives, partial sums for the series and
 * a grid search for the optimisation.
 */

const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

function simpson(f: (x: number) => number, a: number, b: number, n = 2000) {
  const h = (b - a) / n;
  let sum = f(a) + f(b);
  for (let i = 1; i < n; i++) sum += f(a + i * h) * (i % 2 ? 4 : 2);
  return (sum * h) / 3;
}

/** ∫|f| split at the given breakpoints, so Simpson never straddles a kink. */
function absIntegral(f: (x: number) => number, edges: number[]) {
  let total = 0;
  for (let i = 0; i + 1 < edges.length; i++)
    total += Math.abs(simpson(f, edges[i], edges[i + 1]));
  return total;
}

const derivative = (f: (t: number) => number, t: number, h = 1e-4) =>
  (f(t + h) - f(t - h)) / (2 * h);

/** y as a function of x near (x0, y0) on F(x, y) = 0, by Newton's method. */
function implicitY(
  F: (x: number, y: number) => number,
  x0: number,
  y0: number,
) {
  return (x: number) => {
    let y = y0;
    for (let i = 0; i < 40; i++) {
      const dFdy = (F(x, y + 1e-6) - F(x, y - 1e-6)) / 2e-6;
      y -= F(x, y) / dFdy;
    }
    return y;
  };
}

/** Coefficients of the product of two power series, to `length` terms. */
function multiply(a: number[], b: number[], length: number) {
  const out = new Array<number>(length).fill(0);
  a.forEach((ai, i) =>
    b.forEach((bj, j) => {
      if (i + j < length) out[i + j] += ai * bj;
    }),
  );
  return out;
}
const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));

function check(params: PuzzleParams): number {
  switch (params.kind) {
    case "area": {
      const { r1, r2, r3 } = params;
      const d = (x: number) => (x - r1) * (x - r2) * (x - r3);
      return absIntegral(d, [r1, r2, r3]);
    }
    case "volume": {
      const { a, axis } = params;
      const outer = (x: number) =>
        Math.max(Math.abs(a * x - axis), Math.abs(x * x - axis));
      const inner = (x: number) =>
        Math.min(Math.abs(a * x - axis), Math.abs(x * x - axis));
      return simpson((x) => outer(x) ** 2 - inner(x) ** 2, 0, a);
    }
    case "ftc": {
      const { ys, a, b, c } = params;
      const fPrime = (x: number) => {
        const i = Math.min(Math.floor(x), ys.length - 2);
        return ys[i] + (ys[i + 1] - ys[i]) * (x - i);
      };
      return c + simpson(fPrime, a, b, 4000);
    }
    case "motion": {
      const { r1, r2, end, sign, ask } = params;
      const v = (t: number) => sign * t * (t - r1) * (t - r2);
      return ask === "distance"
        ? absIntegral(v, [0, r1, r2, end])
        : simpson(v, 0, end);
    }
    case "implicit": {
      const { x0, y0 } = params;
      if (params.mode === "slope") {
        const { a } = params;
        const c = x0 ** 3 + y0 ** 3 - a * x0 * y0;
        const y = implicitY((x, y) => x ** 3 + y ** 3 - a * x * y - c, x0, y0);
        return derivative(y, x0, 1e-5);
      }
      const { b } = params;
      const c = x0 * x0 + b * y0 * y0;
      const y = implicitY((x, y) => x * x + b * y * y - c, x0, y0);
      const h = 1e-3;
      return (y(x0 + h) - 2 * y(x0) + y(x0 - h)) / (h * h);
    }
    case "series": {
      switch (params.form) {
        case "xe": {
          const { p, q, n } = params;
          const exp = Array.from(
            { length: n + 1 },
            (_, j) => q ** j / factorial(j),
          );
          const shift = [...new Array<number>(p).fill(0), 1];
          return multiply(shift, exp, n + 1)[n] * factorial(n);
        }
        case "cos": {
          const { q, k } = params;
          const n = 4 * k;
          // cos u = Σ (−1)^j u^(2j) / (2j)!, with u = q·x² giving x^(4j).
          const coefficients = new Array<number>(n + 1).fill(0);
          for (let j = 0; 4 * j <= n; j++)
            coefficients[4 * j] = ((-1) ** j * q ** (2 * j)) / factorial(2 * j);
          return coefficients[n] * factorial(n);
        }
        case "nrn": {
          const r = params.p / params.q;
          let sum = 0;
          for (let n = 1; n < 2000; n++) sum += n * r ** n;
          return sum;
        }
        case "telescope": {
          let sum = 0;
          const N = 2_000_000;
          for (let n = 1; n <= N; n++) sum += 1 / (n * (n + params.k));
          // The tail from N on is about 1/N; add it back.
          return sum + 1 / N;
        }
      }
      break;
    }
    case "polar": {
      const r =
        params.form === "limacon"
          ? (t: number) => params.a + params.b * Math.cos(t)
          : (t: number) => params.a * Math.cos(params.k * t);
      const half =
        params.form === "limacon" ? Math.PI : Math.PI / (2 * params.k);
      return simpson((t) => r(t) ** 2 / 2, -half, half) / Math.PI;
    }
    case "euler": {
      const { p, q, r, h, steps } = params;
      let [x, y] = [params.x0, params.y0];
      for (let i = 0; i < steps; i++) {
        y += h * (p * x + q * y + r * x * y);
        x += h;
      }
      return y;
    }
    case "optimize": {
      const { w, l, ask } = params;
      const V = (x: number) => x * (w - 2 * x) * (l - 2 * x);
      let best = 0;
      let lo = 0;
      let hi = Math.min(w, l) / 2;
      for (let round = 0; round < 6; round++) {
        const step = (hi - lo) / 200;
        best = lo;
        for (let x = lo; x <= hi; x += step) if (V(x) > V(best)) best = x;
        [lo, hi] = [Math.max(0, best - step), best + step];
      }
      return ask === "cut" ? best : V(best);
    }
    case "limit": {
      const { a } = params;
      switch (params.form) {
        case "expo": {
          const x = 1e-4;
          return (Math.exp(a * x) - 1 - a * x) / (x * x);
        }
        case "tan": {
          const x = 1e-3;
          return (Math.tan(a * x) - a * x) / x ** 3;
        }
        case "cos": {
          const x = 1e-4;
          return (1 - Math.cos(a * x)) / (x * Math.sin(params.b * x));
        }
        case "power": {
          const x = 1e6;
          return (1 + a / x) ** (params.b * x);
        }
      }
      break;
    }
    case "table": {
      const { f, df, g, dg, a } = params;
      const at = (values: readonly number[], x: number) => values[x - 1];
      if (params.mode === "chain") return at(df, at(g, a)) * at(dg, a);
      if (params.mode === "quotient")
        return (at(df, a) * at(g, a) - at(f, a) * at(dg, a)) / at(g, a) ** 2;
      return 1 / at(df, a);
    }
    case "integral": {
      switch (params.form) {
        case "parts":
          return simpson((x) => x * Math.exp(params.a * x), 0, 1);
        case "fractions":
          return simpson((x) => 1 / ((x + params.p) * (x + params.q)), 0, 1);
        case "usub":
          return simpson(
            (x) => x * Math.sqrt(x * x + params.p ** 2),
            0,
            params.q,
          );
        case "log":
          return simpson((x) => x ** params.n * Math.log(x), 1, Math.E);
      }
      break;
    }
    case "parametric": {
      const { p, q, r, t0, ask } = params;
      const x = (t: number) => t ** 3 + p * t;
      const y = (t: number) => q * t * t + r * t;
      const slope = (t: number) => derivative(y, t) / derivative(x, t);
      if (ask === "slope") return slope(t0);
      if (ask === "concavity")
        return derivative(slope, t0, 1e-3) / derivative(x, t0);
      return Math.hypot(derivative(x, t0), derivative(y, t0));
    }
    case "related": {
      if (params.mode === "ladder") {
        const { x, y, u } = params;
        const L2 = x * x + y * y;
        const top = (t: number) => Math.sqrt(L2 - (x + u * t) ** 2);
        return -derivative(top, 0);
      }
      const { d, east, north, t } = params;
      const s = (time: number) => Math.hypot(d - east * time, north * time);
      return derivative(s, t);
    }
  }
  throw new Error(`no check for ${JSON.stringify(params)}`);
}

test("every closed-form answer agrees with a numerical one", () => {
  const rng = seeded(11);
  const seen = new Map<string, number>();
  for (let i = 0; i < 1500; i++) {
    const params = generatePuzzle(undefined, rng);
    const key = [
      params.kind,
      "mode" in params ? params.mode : "",
      "form" in params ? params.form : "",
      "ask" in params ? params.ask : "",
    ].join(":");
    seen.set(key, (seen.get(key) ?? 0) + 1);
    const { answer, display, working, tolerance } = solve(params);
    expect(Number.isFinite(answer), key).toBe(true);
    expect(display, key).not.toBe("");
    expect(working, key).not.toMatch(/NaN|undefined|Infinity/);
    expect(tolerance).toBe(TOLERANCE);
    const numeric = check(params);
    expect(
      Math.abs(numeric - answer),
      `${key}: ${JSON.stringify(params)} solved ${answer}, numerically ${numeric}`,
    ).toBeLessThan(2e-3 + Math.abs(answer) * 1e-4);
  }
  // Every kind, and every mode, form and question within it, came up.
  expect(new Set([...seen.keys()].map((key) => key.split(":")[0])).size).toBe(
    PUZZLE_KINDS.length,
  );
  expect(seen.size).toBe(32);
});

test("every kind draws a figure and words a question without holes", () => {
  const rng = seeded(5);
  const kinds = new Set<string>();
  for (let i = 0; i < 300; i++) {
    const params = generatePuzzle(undefined, rng);
    kinds.add(params.kind);
    const problem = describePuzzle(params);
    const prompt = renderToStaticMarkup(
      createElement("p", null, problem.prompt),
    );
    const figure = renderToStaticMarkup(
      createElement(
        FigureFrame,
        { description: problem.description },
        problem.figure,
      ),
    );
    for (const text of [
      prompt,
      figure,
      problem.description,
      problem.hint,
      problem.topic,
    ]) {
      expect(text, params.kind).not.toBe("");
      expect(text, `${params.kind}: ${JSON.stringify(params)}`).not.toMatch(
        /NaN|undefined|Infinity/,
      );
    }
    expect(figure).toContain("<svg");
  }
  expect(kinds.size).toBe(PUZZLE_KINDS.length);
});

test("the figure never states the answer", () => {
  const rng = seeded(3);
  for (let i = 0; i < 300; i++) {
    const params = generatePuzzle(undefined, rng);
    if (params.kind === "table") continue; // The table is the given, not the answer.
    const { answer } = solve(params);
    // Small integers are on every axis anyway.
    if (Math.abs(answer - Math.round(answer)) < 1e-9 && Math.abs(answer) <= 12)
      continue;
    const problem = describePuzzle(params);
    const figure = renderToStaticMarkup(
      createElement(
        FigureFrame,
        { description: problem.description },
        problem.figure,
      ),
    );
    // Axis ticks are what they are; the labels are what could give it away.
    const labels = [
      ...figure.matchAll(/paint-order="stroke"[^>]*>([^<]*)</g),
    ].map((match) => match[1]);
    expect(labels, JSON.stringify(params)).not.toContain(fmt(answer));
  }
});

test("the open-box sheets all have a rational best cut", () => {
  for (const [w, l] of BOX_SHEETS) {
    const cut = bestCut(w, l);
    expect(Math.abs(cut * 6 - Math.round(cut * 6))).toBeLessThan(1e-9);
    expect(cut).toBeGreaterThan(0);
    expect(cut).toBeLessThan(Math.min(w, l) / 2);
  }
});

test("legacy geometry rows are told apart from calculus ones", () => {
  expect(isCurrentPuzzle({ kind: "triangle", a: 40, b: 60 })).toBe(false);
  expect(isCurrentPuzzle(generatePuzzle(undefined, seeded(1)))).toBe(true);
});

test("answers may be typed as decimals or fractions", () => {
  expect(parseAnswer("200/27")).toBeCloseTo(200 / 27, 12);
  expect(parseAnswer(" −4.5 ")).toBe(-4.5);
  expect(parseAnswer("-1/3")).toBeCloseTo(-1 / 3, 12);
  expect(parseAnswer("12.5π")).toBe(12.5);
  expect(parseAnswer(".5")).toBe(0.5);
  expect(parseAnswer("")).toBeNull();
  expect(parseAnswer("1/0")).toBeNull();
  expect(parseAnswer("2x")).toBeNull();
  expect(parseAnswer("1/2/3")).toBeNull();
});

test("expressions read like a textbook", () => {
  expect(poly([6, -5, -2, 1])).toBe("x³ − 2x² − 5x + 6");
  expect(poly([0, 1, 0, -1], "t")).toBe("−t³ + t");
  expect(poly([0, 0])).toBe("0");
  expect(
    terms([
      [1, "x"],
      [-2, "y"],
      [1, "xy"],
    ]),
  ).toBe("x − 2y + xy");
  expect(show(200 / 27)).toBe("200/27 ≈ 7.407");
  expect(show(6)).toBe("6");
  expect(show(Math.E)).toBe("2.718");
  expect(fmt(-0.0004)).toBe("0");
  expect(sup("(5)")).toBe("⁽⁵⁾");
  expect(sup("-3x")).toBe("⁻³ˣ");
});
