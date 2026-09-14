import { describe, expect, test } from "vitest";
import catalogue from "@/lib/activities.catalogue.json";
import { GENRES } from "@/lib/genres";

/** Heroicons export the exotic object `forwardRef` returns, not a function. */
const isComponent = (value: unknown) =>
  typeof value === "function" ||
  (typeof value === "object" && value !== null && "$$typeof" in value);

const usedGenres = [
  ...new Set((catalogue as { genre: string }[]).map((entry) => entry.genre)),
].sort();

describe("GENRES", () => {
  test("the catalogue uses at least one genre", () => {
    expect(usedGenres.length).toBeGreaterThan(0);
  });

  test.each(usedGenres)(
    "catalogue genre %s has presentation metadata",
    (genre) => {
      expect(Object.keys(GENRES)).toContain(genre);
    },
  );

  test("every genre with metadata appears in the catalogue", () => {
    expect(Object.keys(GENRES).sort()).toEqual(usedGenres);
  });

  test.each(Object.entries(GENRES))(
    "%s has a label, an icon and a six-digit hex hue",
    (_genre, meta) => {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(isComponent(meta.icon)).toBe(true);
      expect(meta.hue).toMatch(/^#[0-9a-f]{6}$/);
    },
  );

  test("hues and labels are distinct across genres", () => {
    const hues = Object.values(GENRES).map((meta) => meta.hue);
    const labels = Object.values(GENRES).map((meta) => meta.label);
    expect(new Set(hues).size).toBe(hues.length);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
