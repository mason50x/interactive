import { describe, expect, test } from "vitest";
import { originFromEnv, withoutTrailingSlash } from "@/lib/origin";

describe("originFromEnv", () => {
  test.each([
    [["https://a.example/"], "https://a.example"],
    [["https://a.example"], "https://a.example"],
    [["[SENSITIVE]", "https://a.example/"], "https://a.example"],
    [[undefined, "https://a.example"], "https://a.example"],
    [["", "https://a.example"], "https://a.example"],
    [["https://a.example", "https://b.example"], "https://a.example"],
    [["not a url", undefined, "https://b.example/"], "https://b.example"],
    [["https://a.example:8443/"], "https://a.example:8443"],
  ])("%j resolves to %s", (candidates, expected) => {
    expect(originFromEnv(...candidates)).toBe(expected);
  });

  test("a path or query is reduced to the origin", () => {
    expect(originFromEnv("https://a.example/some/path?x=1")).toBe(
      "https://a.example",
    );
  });

  test.each([[[]], [[undefined]], [["", undefined]], [["[SENSITIVE]"]]])(
    "%j has no usable origin and yields null",
    (candidates) => {
      expect(originFromEnv(...candidates)).toBeNull();
    },
  );
});

describe("withoutTrailingSlash", () => {
  test.each([
    ["https://a.example/", "https://a.example"],
    ["https://a.example", "https://a.example"],
    ["https://a.example//", "https://a.example/"],
    ["", ""],
    ["/", ""],
  ])("%j -> %j", (input, expected) => {
    expect(withoutTrailingSlash(input)).toBe(expected);
  });

  test("is idempotent", () => {
    const once = withoutTrailingSlash("https://a.example/");
    expect(withoutTrailingSlash(once)).toBe(once);
  });
});
