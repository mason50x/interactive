import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { expect, test } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { matchesMiddleware } from "../../node_modules/vinext/dist/server/middleware-matcher.js";

const output = ts.transpileModule(readFileSync("src/proxy.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleExports = { config: { matcher: [] as string[] } };
vm.runInNewContext(output, {
  exports: moduleExports,
  require(name: string) {
    if (name === "@clerk/nextjs/server")
      return {
        clerkMiddleware: (handler: unknown) => handler,
        createRouteMatcher: () => () => false,
      };
    if (name === "next/server") return {};
    if (name === "@/lib/learn") return { LEARN_PATH_PREFIX: "/learn" };
    throw new Error(name);
  },
});

for (const path of [
  "/dashboard",
  "/dashboard/activities/missing.png",
  "/dashboard/chat/room.js",
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
      unstable_doesMiddlewareMatch({
        config: moduleExports.config,
        nextConfig: {},
        url: path,
      }),
    ).toBe(true);
    expect(matchesMiddleware(new URL(path, "https://test.invalid").pathname, moduleExports.config.matcher)).toBe(true);
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
      unstable_doesMiddlewareMatch({
        config: moduleExports.config,
        nextConfig: {},
        url: path,
      }),
    ).toBe(false);
    expect(matchesMiddleware(new URL(path, "https://test.invalid").pathname, moduleExports.config.matcher)).toBe(false);
  });
}
