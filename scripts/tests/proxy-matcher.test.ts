import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { expect, test } from "vitest";
import { unstable_doesProxyMatch } from "next/experimental/testing/server";

const output = ts.transpileModule(readFileSync("src/proxy.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleExports = { config: { matcher: [] as string[] } };
vm.runInNewContext(output, {
  exports: moduleExports,
  require(name: string) {
    if (name === "@clerk/nextjs/server") return {
      clerkMiddleware: (handler: unknown) => handler,
      createRouteMatcher: () => () => false,
    };
    if (name === "next/server") return {};
    if (name === "@/lib/learn") return { LEARN_PATH_PREFIX: "/learn" };
    throw new Error(name);
  },
});

for (const path of ["/dashboard", "/dashboard/activities/missing.png", "/dashboard/chat/room.js", "/learn/missing.html", "/auth/sign-in/test.css", "/__clerk/test", "/api/test", "/"]) {
  test(`Clerk runs for ${path}`, () => {
    expect(unstable_doesProxyMatch({ config: moduleExports.config, nextConfig: {}, url: path })).toBe(true);
  });
}
for (const path of ["/_next/static/chunk.js", "/_next/image?url=x", "/brand/logo-lockup.png", "/thumbnails/game.webp"]) {
  test(`static asset avoids Clerk for ${path}`, () => {
    expect(unstable_doesProxyMatch({ config: moduleExports.config, nextConfig: {}, url: path })).toBe(false);
  });
}
