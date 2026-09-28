import { expect, test, vi } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

/**
 * Only `config.matcher` is under test. The modules `src/proxy.ts` imports for
 * the handler itself are stubbed so nothing here needs a Clerk key or a Next
 * request context.
 */
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: unknown) => handler,
  createRouteMatcher: () => () => false,
}));
vi.mock("next/server", () => ({}));
vi.mock("@/lib/learn", () => ({ LEARN_PATH_PREFIX: "/learn" }));
vi.mock("@/lib/access-hours", () => ({}));

const { config } = await import("@/proxy");

for (const path of [
  "/home",
  "/activities",
  "/leaderboard",
  "/chat",
  "/browse/release",
  "/emulate/html/test.html",
  "/activities/missing.png",
  "/chat/room.js",
  "/learn/missing.html",
  "/auth/sign-in/test.css",
  "/__clerk/test",
  "/api/test",
  "/",
  "/about",
  "/contact",
  "/tos",
  "/pp",
]) {
  test(`Clerk runs for ${path}`, () => {
    expect(
      unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path }),
    ).toBe(true);
  });
}
for (const path of [
  "/_next/static/chunk.js",
  "/_next/image?url=x",
  "/brand/logo-lockup.png",
  "/thumbnails/game.webp",
]) {
  test(`static asset avoids Clerk for ${path}`, () => {
    expect(
      unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path }),
    ).toBe(false);
  });
}
