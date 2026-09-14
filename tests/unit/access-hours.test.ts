import { describe, expect, test } from "vitest";
import { accessClosedResponse } from "@/lib/access-hours";

const request = (method: string) =>
  new Request("https://example.org/dashboard", { method });

describe("accessClosedResponse", () => {
  test.each(["GET", "HEAD", "POST"])("%s is a 403", (method) => {
    expect(accessClosedResponse(request(method)).status).toBe(403);
  });

  test("HEAD carries no body", () => {
    expect(accessClosedResponse(request("HEAD")).body).toBeNull();
  });

  test("GET explains the hours in an HTML document", async () => {
    const response = accessClosedResponse(request("GET"));
    expect(response.headers.get("Content-Type")).toBe(
      "text/html; charset=utf-8",
    );
    const body = await response.text();
    expect(body.startsWith("<!doctype html>")).toBe(true);
    expect(body).toContain("Monday–Friday, 7:30 a.m.–2:55 p.m. Central time");
    expect(body).toContain("<title>Outside access hours</title>");
  });

  test.each([
    ["Cache-Control", "private, no-store"],
    ["X-Content-Type-Options", "nosniff"],
    ["X-Robots-Tag", "noindex, nofollow"],
    ["Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'"],
  ])("sets %s to %j on every method", (header, value) => {
    for (const method of ["GET", "HEAD"]) {
      expect(accessClosedResponse(request(method)).headers.get(header)).toBe(
        value,
      );
    }
  });
});
