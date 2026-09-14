import { describe, expect, test } from "vitest";
import {
  filterActivities,
  popularityLabel,
  THUMBNAIL_PATH,
  thumbnailSrc,
  type Activity,
} from "@/lib/activity";

function activity(
  slug: string,
  title: string,
  genre: Activity["genre"],
  rank: number,
): Activity {
  return {
    slug,
    path: [...slug].reverse().join(""),
    title,
    genre,
    rank,
    thumbnail: `${slug}.webp`,
    bytes: 1,
  };
}

const catalogue: readonly Activity[] = [
  activity("slope", "Slope", "coordination", 0),
  activity("papaspizzaria", "Papa's Pizzaria", "systems", 1),
  activity("run3", "Run 3", "reaction", 2),
  activity("crossy", "Crossy Road", "reaction", 3),
  activity("2048", "2048", "problem-solving", 4),
];

const slugs = (list: readonly Activity[]) => list.map((item) => item.slug);

describe("filterActivities", () => {
  test.each([
    ["papa's", ["papaspizzaria"]],
    ["papas", ["papaspizzaria"]],
    ["PAPA'S PIZZ", ["papaspizzaria"]],
    ["run 3", ["run3"]],
    ["run3", ["run3"]],
    ["reaction", ["run3", "crossy"]],
    ["systems", ["papaspizzaria"]],
    ["problem solving", ["2048"]],
    ["crossy", ["crossy"]],
    ["o", ["slope", "run3", "crossy", "2048"]],
    ["zzz", []],
  ])("%j matches %j", (query, expected) => {
    expect(slugs(filterActivities(catalogue, query))).toEqual(expected);
  });

  test.each(["", "   ", "'!?"])(
    "a query with nothing searchable (%j) returns the same array",
    (query) => {
      expect(filterActivities(catalogue, query)).toBe(catalogue);
    },
  );

  test("preserves the order of the list it was given", () => {
    const reversed = [...catalogue].reverse();
    expect(slugs(filterActivities(reversed, "o"))).toEqual([
      "2048",
      "crossy",
      "run3",
      "slope",
    ]);
  });
});

test("thumbnailSrc serves tile art from the public thumbnails path", () => {
  expect(THUMBNAIL_PATH).toBe("/thumbnails");
  expect(thumbnailSrc({ ...catalogue[0], thumbnail: "slope.jpg" })).toBe(
    "/thumbnails/slope.jpg",
  );
});

test.each([
  [0, "#1 most viewed"],
  [1, "#2 most viewed"],
  [41, "#42 most viewed"],
])("popularityLabel turns rank %i into %s", (rank, label) => {
  expect(popularityLabel({ ...catalogue[0], rank })).toBe(label);
});
