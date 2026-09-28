import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  accessClosedResponse,
  isAccessClosed,
  isAccessOpen,
} from "../../src/lib/access-hours";

afterEach(() => vi.unstubAllEnvs());

describe("working hours", () => {
  it.each([
    "2026-09-14T07:30:00-05:00",
    "2026-09-14T10:00:00-05:00",
    "2026-09-18T14:54:59-05:00",
  ])("is open at %s", (time) => {
    expect(isAccessOpen(new Date(time))).toBe(true);
  });

  it.each([
    "2026-09-14T07:29:59-05:00",
    "2026-09-18T14:55:00-05:00",
    "2026-09-19T12:00:00-05:00",
    "2026-09-20T23:00:00-05:00",
    "2026-01-05T23:00:00-06:00",
  ])("is closed at %s", (time) => {
    expect(isAccessOpen(new Date(time))).toBe(false);
  });
});

describe("the production gate", () => {
  const saturday = new Date("2026-09-19T12:00:00-05:00");
  const monday = new Date("2026-09-14T10:00:00-05:00");

  beforeEach(() => vi.stubEnv("VERCEL_ENV", "production"));

  it("closes production outside working hours", () => {
    expect(
      isAccessClosed(new Request("https://example.com/home"), saturday),
    ).toBe(true);
    expect(
      isAccessClosed(new Request("https://example.com/home"), monday),
    ).toBe(false);
  });

  it.each(["preview", "development", ""])(
    "leaves VERCEL_ENV=%j open around the clock",
    (env) => {
      vi.stubEnv("VERCEL_ENV", env);
      expect(
        isAccessClosed(new Request("https://example.com/home"), saturday),
      ).toBe(false);
    },
  );

  it("serves the bypass IP outside working hours", () => {
    const request = new Request("https://example.com/home", {
      headers: { "x-real-ip": "66.41.5.109" },
    });
    expect(isAccessClosed(request, saturday)).toBe(false);
  });

  it("ignores a spoofed bypass IP in X-Forwarded-For", () => {
    const request = new Request("https://example.com/home", {
      headers: { "X-Forwarded-For": "66.41.5.109" },
    });
    expect(isAccessClosed(request, saturday)).toBe(true);
  });

  it("answers 403 HTML, and HEAD with an empty body", async () => {
    const get = accessClosedResponse(new Request("https://example.com/home"));
    expect(get.status).toBe(403);
    expect(get.headers.get("content-type")).toContain("text/html");
    expect(get.headers.get("cache-control")).toBe("private, no-store");
    expect(await get.text()).toContain("Outside working hours");
    const head = accessClosedResponse(
      new Request("https://example.com/home", { method: "HEAD" }),
    );
    expect(head.status).toBe(403);
    expect(await head.text()).toBe("");
  });
});
