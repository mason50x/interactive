import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: true },
  clerk: {
    isLoaded: true,
    user: { id: "account", username: "person", updatedAt: new Date(1) },
  },
  sync: vi.fn<() => Promise<void>>(),
  effect:
    vi.fn<(effect: () => (() => void) | undefined, deps: unknown[]) => void>(),
}));

vi.mock("@clerk/nextjs", () => ({ useUser: () => mocks.clerk }));
vi.mock("convex/react", () => ({ useConvexAuth: () => mocks.auth }));
vi.mock("react", () => ({ useEffect: mocks.effect }));
vi.mock("@/lib/account-actions", () => ({ syncChatAccount: mocks.sync }));

import { StoreUser } from "../../src/components/store-user";

function mount() {
  StoreUser();
  return mocks.effect.mock.calls.at(-1)![0]();
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.auth.isAuthenticated = true;
  mocks.clerk.isLoaded = true;
  mocks.clerk.user.id = "account";
  mocks.clerk.user.username = "person";
  mocks.sync.mockReset().mockResolvedValue(undefined);
  mocks.effect.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("syncs from the app-wide component and recovers without opening Chat", async () => {
  mocks.sync.mockRejectedValueOnce(new Error("Temporary failure"));
  const cleanup = mount();
  expect(mocks.sync).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1000);
  expect(mocks.sync).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(mocks.sync).toHaveBeenCalledTimes(2);
  cleanup?.();
});

test("waits for authentication and a loaded Clerk username", () => {
  mocks.auth.isAuthenticated = false;
  mount();
  mocks.auth.isAuthenticated = true;
  mocks.clerk.isLoaded = false;
  mount();
  mocks.clerk.isLoaded = true;
  mocks.clerk.user.username = "";
  mount();
  expect(mocks.sync).not.toHaveBeenCalled();
  mocks.clerk.user.username = "person";
  const cleanup = mount();
  expect(mocks.sync).toHaveBeenCalledOnce();
  cleanup?.();
});

test("backs off repeated failures and cancels scheduled retries on cleanup", async () => {
  mocks.sync.mockRejectedValue(new Error("Offline"));
  const cleanup = mount();
  await vi.advanceTimersByTimeAsync(1000);
  expect(mocks.sync).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1999);
  expect(mocks.sync).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(mocks.sync).toHaveBeenCalledTimes(3);
  cleanup?.();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(mocks.sync).toHaveBeenCalledTimes(3);
});

test("an in-flight failure cannot schedule retries after sign-out or unmount", async () => {
  let reject!: (reason: Error) => void;
  mocks.sync.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  const cleanup = mount();
  cleanup?.();
  reject(new Error("Session ended"));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(mocks.sync).toHaveBeenCalledOnce();
});

test("switching accounts triggers a new sync even with the same profile timestamp", () => {
  const cleanup = mount();
  const firstDeps = mocks.effect.mock.calls.at(-1)![1];
  cleanup?.();
  mocks.clerk.user.id = "other-account";
  const nextCleanup = mount();
  expect(mocks.effect.mock.calls.at(-1)![1]).not.toEqual(firstDeps);
  expect(mocks.sync).toHaveBeenCalledTimes(2);
  nextCleanup?.();
});
