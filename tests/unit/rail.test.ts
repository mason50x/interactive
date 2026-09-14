import { afterEach, describe, expect, test, vi } from "vitest";
import { RAIL_COOKIE, railState, rememberRailState } from "@/lib/rail";

afterEach(() => vi.unstubAllGlobals());

describe("railState", () => {
  test.each([
    [undefined, "open"],
    ["", "open"],
    ["open", "open"],
    ["closed", "closed"],
    ["Closed", "open"],
    ["true", "open"],
    ["garbage", "open"],
    [" closed", "open"],
  ])("cookie value %j is the %s rail", (value, expected) => {
    expect(railState(value)).toBe(expected);
  });
});

describe("rememberRailState", () => {
  test("writes a year-long, site-wide, lax cookie under the rail's name", () => {
    expect(RAIL_COOKIE).toBe("il-rail");
    const document = { cookie: "" };
    vi.stubGlobal("document", document);

    rememberRailState("closed");
    expect(document.cookie).toBe(
      "il-rail=closed; path=/; max-age=31536000; samesite=lax",
    );
    expect(railState("closed")).toBe("closed");

    rememberRailState("open");
    expect(document.cookie).toBe(
      "il-rail=open; path=/; max-age=31536000; samesite=lax",
    );
  });
});
