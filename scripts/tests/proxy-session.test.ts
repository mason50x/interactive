import { beforeEach, expect, test, vi } from "vitest";

/**
 * The session gate in `src/proxy.ts`, with Clerk stubbed: `clerkMiddleware`
 * calls the handler with a fake `auth`, and each test says whether it finds a
 * user. What is under test is what the gate does with a request Clerk cannot
 * renew an expired session on — the router's own fetches.
 */
const clerk = vi.hoisted(() => {
  const state = { userId: null as string | null };
  const protect = vi.fn(async () => {
    if (!state.userId) throw new Error("redirect to sign-in");
  });
  const auth = Object.assign(async () => ({ userId: state.userId }), {
    protect,
  });
  return { state, protect, auth };
});

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware:
    (handler: (auth: unknown, req: unknown) => unknown) => (req: unknown) =>
      handler(clerk.auth, req),
}));
vi.mock("@/lib/learn", () => ({ LEARN_PATH_PREFIX: "/learn" }));
vi.mock("@/lib/access-hours", () => ({ isAccessClosed: () => false }));

const { default: proxy, canRenewSession } = await import("@/proxy");

beforeEach(() => {
  clerk.state.userId = null;
  clerk.protect.mockClear();
});

function request(
  path: string,
  headers: Record<string, string>,
  method = "GET",
) {
  const req = new Request(`https://example.test${path}`, { method, headers });
  return Object.assign(req, { nextUrl: new URL(req.url) });
}

const gate = (req: ReturnType<typeof request>) =>
  (proxy as unknown as (req: unknown, event: unknown) => Promise<unknown>)(
    req,
    {},
  );

const documentLoad = { "sec-fetch-dest": "document", accept: "text/html" };
const routerFetch = { "sec-fetch-dest": "empty", accept: "*/*" };

test("a document load can renew the session", () => {
  expect(canRenewSession(request("/home", documentLoad))).toBe(true);
  expect(
    canRenewSession(request("/home", { "sec-fetch-dest": "iframe" })),
  ).toBe(true);
  expect(canRenewSession(request("/home", { accept: "text/html" }))).toBe(true);
});

test("a router fetch or a POST cannot", () => {
  expect(canRenewSession(request("/home", routerFetch))).toBe(false);
  expect(canRenewSession(request("/home", { accept: "*/*" }))).toBe(false);
  expect(canRenewSession(request("/home", documentLoad, "POST"))).toBe(false);
});

test("a signed-out router fetch reloads as a page instead of going to sign-in", async () => {
  const response = (await gate(request("/chat", routerFetch))) as Response;
  expect(clerk.protect).not.toHaveBeenCalled();
  expect(response.status).toBe(401);
  expect(response.body).toBeNull();
  expect(response.headers.get("cache-control")).toBe("no-store");
});

test("a signed-in router fetch passes", async () => {
  clerk.state.userId = "user_1";
  expect(await gate(request("/chat", routerFetch))).toBeUndefined();
  expect(clerk.protect).not.toHaveBeenCalled();
});

test("a document load is still protected", async () => {
  await expect(gate(request("/chat", documentLoad))).rejects.toThrow(
    "redirect to sign-in",
  );
  expect(clerk.protect).toHaveBeenCalledOnce();
});

test("a POST is still protected", async () => {
  await expect(
    gate(request("/browse/access", routerFetch, "POST")),
  ).rejects.toThrow("redirect to sign-in");
  expect(clerk.protect).toHaveBeenCalledOnce();
});
