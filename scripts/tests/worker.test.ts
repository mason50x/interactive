import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("Worker availability", () => {
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
      new Request("http://localhost:3000/home"),
      env,
      {} as ExecutionContext,
    );
    expect(fetchApp).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each([
    "2026-09-14T07:35:00-05:00",
    "2026-09-14T10:00:00-05:00",
    "2026-09-18T14:54:59-05:00",
  ])("serves production requests at %s", async (time) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(time));
    for (const path of ["/", "/home", "/learn/test", "/api/test"]) {
      fetchApp.mockResolvedValue(new Response("app"));
      const response = await worker.fetch(
        new Request(`https://example.com${path}`),
        env,
        {} as ExecutionContext,
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("app");
    }
    expect(fetchApp).toHaveBeenCalledTimes(4);
  });

  it.each([
    "2026-09-14T07:34:59-05:00",
    "2026-09-18T14:55:00-05:00",
    "2026-09-19T12:00:00-05:00",
    "2026-09-20T23:00:00-05:00",
    "2026-01-05T23:00:00-06:00",
  ])("blocks production requests at %s", async (time) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(time));
    for (const path of ["/", "/home", "/learn/test", "/api/test"]) {
      fetchApp.mockResolvedValue(new Response("app"));
      const response = await worker.fetch(
        new Request(`https://example.com${path}`),
        env,
        {} as ExecutionContext,
      );
      expect(response.status).toBe(403);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(await response.text()).toContain("Outside working hours");
    }
    expect(fetchApp).not.toHaveBeenCalled();
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it("blocks HEAD requests outside access hours with an empty body", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T12:00:00-05:00"));
    const response = await worker.fetch(
      new Request("https://example.com/home", { method: "HEAD" }),
      env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(403);
    expect(await response.text()).toBe("");
    expect(fetchApp).not.toHaveBeenCalled();
    expect(fetchAsset).not.toHaveBeenCalled();
  });

  it("preserves response policy", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T07:35:00-05:00"));
    fetchApp.mockResolvedValue(new Response("app"));
    const response = await worker.fetch(
      new Request("https://example.com/home"),
      env,
      {} as ExecutionContext,
    );
    expect(fetchApp).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("app");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each(["GET", "HEAD"])(
    "blocks assets on weekends for %s",
    async (method) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-19T12:00:00-05:00"));
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
      expect(response.status).toBe(403);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(fetchApp).not.toHaveBeenCalled();
      expect(fetchAsset).not.toHaveBeenCalled();
    },
  );
});

describe("asset browser caching", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T10:00:00-05:00"));
  });

  it.each([
    ["/_next/static/chunks/app-abc123.js", 3600],
    ["/thumbnails/flappybird.jpg", 300],
    ["/favicon.ico", 300],
  ])("gives %s a bounded browser cache", async (path, seconds) => {
    fetchAsset.mockResolvedValue(
      new Response("asset", {
        headers: {
          "Cache-Control": "public, max-age=0, must-revalidate",
          Age: "900",
        },
      }),
    );
    const response = await worker.fetch(
      new Request(`https://example.com${path}`),
      env,
      {} as ExecutionContext,
    );
    expect(response.headers.get("cache-control")).toBe(
      `private, max-age=${seconds}, must-revalidate`,
    );
    expect(response.headers.has("age")).toBe(false);
    expect(response.headers.get("date")).toBe(new Date().toUTCString());
    expect(fetchApp).not.toHaveBeenCalled();
  });

  it.each([200, 304])(
    "keeps the full cache lifetime for %s assets in the afternoon",
    async (status) => {
      vi.setSystemTime(new Date("2026-09-14T14:54:30.500-05:00"));
      fetchAsset.mockResolvedValue(new Response(null, { status }));
      const response = await worker.fetch(
        new Request("https://example.com/_next/static/chunks/app.js"),
        env,
        {} as ExecutionContext,
      );
      expect(response.headers.get("cache-control")).toBe(
        "private, max-age=3600, must-revalidate",
      );
    },
  );

  it("does not cache app responses that look like assets", async () => {
    fetchAsset.mockResolvedValue(new Response(null, { status: 404 }));
    fetchApp.mockResolvedValue(new Response("missing", { status: 404 }));
    const response = await worker.fetch(
      new Request("https://example.com/_next/static/missing.js"),
      env,
      {} as ExecutionContext,
    );
    expect(response.headers.get("cache-control")).toBeNull();
  });

  it.each([
    "/home/private.js",
    "/activities/game.html",
    "/chat/room.js",
    "/experience/app",
    "/learning-simulator/test",
    "/dashboard/chat",
    "/learn/activity.html",
    "/auth/sign-in",
  ])("keeps %s uncacheable even if the asset binding answers", async (path) => {
    fetchAsset.mockResolvedValue(new Response("private"));
    const response = await worker.fetch(
      new Request(`https://example.com${path}`),
      env,
      {} as ExecutionContext,
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
