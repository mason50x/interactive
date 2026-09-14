import { afterEach, describe, expect, test, vi } from "vitest";
import { hasChatAdminBadge, isChatAdmin } from "@config/chat-admin";

afterEach(() => vi.unstubAllEnvs());

const cases = [
  { name: "isChatAdmin", variable: "CHAT_ADMIN_CLERK_IDS", check: isChatAdmin },
  {
    name: "hasChatAdminBadge",
    variable: "NEXT_PUBLIC_CHAT_ADMIN_CLERK_IDS",
    check: hasChatAdminBadge,
  },
] as const;

describe.each(cases)("$name", ({ variable, check }) => {
  test("denies everyone when the variable is unset", () => {
    vi.stubEnv(variable, undefined);
    expect(check("user_1")).toBe(false);
  });

  test("denies everyone when the variable is empty", () => {
    vi.stubEnv(variable, "");
    expect(check("user_1")).toBe(false);
  });

  test("trims spaces around a comma-separated list", () => {
    vi.stubEnv(variable, " user_1 , user_2,user_3 ,, ");
    expect(check("user_1")).toBe(true);
    expect(check("user_2")).toBe(true);
    expect(check("user_3")).toBe(true);
  });

  test.each([
    ["user_1", true],
    ["user_10", false],
    ["user", false],
    ["USER_1", false],
    [" user_1", false],
    ["", false],
  ])("matches exactly: %j -> %s", (clerkId, expected) => {
    vi.stubEnv(variable, "user_1,user_2");
    expect(check(clerkId)).toBe(expected);
  });

  test("an empty clerkId never matches, even an empty list entry", () => {
    vi.stubEnv(variable, "user_1,,");
    expect(check("")).toBe(false);
  });
});

describe("the two variables do not leak into each other", () => {
  test("the badge never reads the server variable", () => {
    vi.stubEnv("CHAT_ADMIN_CLERK_IDS", "user_1");
    vi.stubEnv("NEXT_PUBLIC_CHAT_ADMIN_CLERK_IDS", "");
    expect(isChatAdmin("user_1")).toBe(true);
    expect(hasChatAdminBadge("user_1")).toBe(false);
  });

  test("authorization never reads the public variable", () => {
    vi.stubEnv("CHAT_ADMIN_CLERK_IDS", "");
    vi.stubEnv("NEXT_PUBLIC_CHAT_ADMIN_CLERK_IDS", "user_1");
    expect(isChatAdmin("user_1")).toBe(false);
    expect(hasChatAdminBadge("user_1")).toBe(true);
  });
});
