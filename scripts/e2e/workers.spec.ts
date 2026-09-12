import { expect, test } from "@playwright/test";

test("public routes and static assets retain the response policy", async ({
  request,
}) => {
  for (const path of [
    "/",
    "/about",
    "/contact",
    "/tos",
    "/pp",
    "/robots.txt",
    "/favicon.ico",
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["x-robots-tag"], path).toContain("noindex");
    expect(response.headers()["content-security-policy"], path).toBe(
      "frame-ancestors 'none'",
    );
  }
});

test("anonymous requests cannot read protected HTML or RSC, including dotted slugs", async ({
  request,
}) => {
  for (const path of [
    "/dashboard",
    "/dashboard/chat/room.js",
    "/dashboard/activities/missing.png",
    "/learn/crossy",
    "/learn/missing.html",
  ]) {
    for (const headers of [
      {},
      { RSC: "1" },
      {
        "x-clerk-auth-status": "signed-in",
        "x-clerk-auth-token": "invalid",
        "x-middleware-subrequest":
          "middleware:middleware:middleware:middleware:middleware",
      },
    ] as Record<string, string>[]) {
      const response = await request.get(path, { headers, maxRedirects: 0 });
      expect([302, 303, 307, 308, 401, 404], path).toContain(response.status());
      expect(response.headers()["x-robots-tag"], path).toContain("noindex");
      expect(response.headers()["cache-control"], path).not.toContain("public");
      if (path.startsWith("/learn/")) {
        expect(response.headers()["content-security-policy"]).toBe(
          "frame-ancestors 'self'",
        );
        expect(response.headers()["referrer-policy"]).toBe("no-referrer");
      }
    }
  }
});
