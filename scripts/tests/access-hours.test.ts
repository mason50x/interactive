import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isAccessOpen } from "../../src/lib/access-hours";

const { fetchApp, fetchAsset } = vi.hoisted(() => ({
  fetchApp: vi.fn(),
  fetchAsset: vi.fn(),
}));
const env = { ASSETS: { fetch: fetchAsset } } as unknown as Cloudflare.Env;
vi.mock("vinext/server/fetch-handler", () => ({
  default: { fetch: fetchApp },
}));
import worker from "../../worker";

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe("Central access hours", () => {
  it.each([
    ["2026-09-14T07:29:59-05:00", false],
    ["2026-09-14T07:30:00-05:00", true],
    ["2026-09-14T14:54:59-05:00", true],
    ["2026-09-14T14:55:00-05:00", false],
    ["2026-09-15T12:00:00-05:00", true],
    ["2026-09-16T12:00:00-05:00", true],
    ["2026-09-17T12:00:00-05:00", true],
    ["2026-09-18T14:54:59-05:00", true],
    ["2026-09-18T14:55:00-05:00", false],
    ["2026-09-19T12:00:00-05:00", false],
    ["2026-09-20T12:00:00-05:00", false],
    ["2026-09-21T00:00:00-05:00", false],
    ["2026-01-05T07:29:59-06:00", false],
    ["2026-01-05T07:30:00-06:00", true],
    ["2026-01-05T14:55:00-06:00", false],
    ["2026-03-09T07:30:00-05:00", true],
    ["2026-11-02T07:29:59-06:00", false],
    ["2026-11-02T07:30:00-06:00", true],
  ])("%s is open: %s", (time, expected) => {
    expect(isAccessOpen(new Date(time))).toBe(expected);
  });
});

describe("Worker access enforcement", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    fetchAsset.mockImplementation(
      async () => new Response(null, { status: 404 }),
    );
  });

  it("allows development requests outside access hours", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T12:00:00-05:00"));
    fetchApp.mockResolvedValue(new Response("app"));
    const response = await worker.fetch(
      new Request("http://localhost:3000/dashboard"),
      env,
      {} as ExecutionContext,
    );
    expect(fetchApp).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each([
    "/",
    "/dashboard",
    "/learn/test",
    "/api/test",
    "/favicon.ico",
    "/_next/static/test.js",
  ])(
    "blocks %s before invoking the app, regardless of visitor headers",
    async (path) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-18T14:55:00-05:00"));
      const response = await worker.fetch(
        new Request(`https://example.com${path}`, {
          headers: {
            "CF-Connecting-IP": "127.0.0.1",
            "x-forwarded-for": "127.0.0.1",
            RSC: "1",
          },
        }),
        env,
        {} as ExecutionContext,
      );
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(await response.text()).toContain(
        "7:30 a.m.–2:55 p.m. Central time",
      );
      expect(fetchApp).not.toHaveBeenCalled();
      expect(fetchAsset).not.toHaveBeenCalled();
    },
  );

  it("passes through during access hours and preserves response policy", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T07:30:00-05:00"));
    fetchApp.mockResolvedValue(new Response("app"));
    const response = await worker.fetch(
      new Request("https://example.com/dashboard"),
      env,
      {} as ExecutionContext,
    );
    expect(fetchApp).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("app");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each(["GET", "HEAD"])(
    "serves assets during access hours for %s",
    async (method) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-14T07:30:00-05:00"));
      fetchAsset.mockResolvedValue(
        new Response(method === "HEAD" ? null : "body{}", {
          headers: { "Content-Type": "text/css" },
        }),
      );
      const response = await worker.fetch(
        new Request("https://example.com/_next/static/layout.css", { method }),
        env,
        {} as ExecutionContext,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/css");
      expect(response.headers.get("x-robots-tag")).toContain("noindex");
      expect(await response.text()).toBe(method === "HEAD" ? "" : "body{}");
      expect(fetchApp).not.toHaveBeenCalled();
    },
  );

  it("returns no body for blocked HEAD requests", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T12:00:00-05:00"));
    const response = await worker.fetch(
      new Request("https://example.com", { method: "HEAD" }),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(403);
    expect(await response.text()).toBe("");
  });
});
