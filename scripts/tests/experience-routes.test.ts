import { afterEach, beforeEach, expect, test, vi } from "vitest";
import access from "../../config/experience-access.json";

const { auth, protect } = vi.hoisted(() => ({ auth: vi.fn(), protect: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: Object.assign(auth, { protect }) }));
vi.mock("@/components/app/experience-chrome", () => ({ ExperienceChrome: () => null }));

import Catalogue from "@/app/(app)/experience/page";
import AppPage from "@/app/(app)/experience/[app]/page";
import { POST } from "@/app/(app)/experience/access/route";

beforeEach(() => {
  vi.stubEnv("EXPERIENCE_ACCESS_SECRET", "test-only-experience-secret-at-least-32-characters");
  vi.stubEnv("EXPERIENCE_ORIGIN", "https://experience.test");
  auth.mockResolvedValue({ userId: access.xClerkId });
  protect.mockResolvedValue({ userId: access.xClerkId });
});
afterEach(() => vi.unstubAllEnvs());

test("Mason sees X and can open it with a scoped relay grant", async () => {
  const page = await Catalogue();
  expect(page.props.services.find(service => service.id === "x")?.src).toBe("https://experience.test/?u=https%3A%2F%2Fx.com%2F");
  expect(page.props.accessToken).toEqual(expect.any(String));
  expect((await AppPage({ params: Promise.resolve({ app: "x" }) })).props.initialAppId).toBe("x");
});

test("other users do not receive X in the catalogue, direct route or grant endpoint", async () => {
  auth.mockResolvedValue({ userId: "user_other", username: "mason" });
  protect.mockResolvedValue({ userId: "user_other", username: "mason" });
  expect((await Catalogue()).props.services.some(service => service.id === "x")).toBe(false);
  await expect(AppPage({ params: Promise.resolve({ app: "x" }) })).rejects.toThrow();
  const response = await POST(new Request("https://app.test/experience/access", { method: "POST", headers: { origin: "https://app.test" } }));
  expect(response.status).toBe(403);
});

test("grant renewal requires a same-origin authenticated request and never caches tokens", async () => {
  const response = await POST(new Request("https://app.test/experience/access", { method: "POST", headers: { origin: "https://app.test" } }));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toMatchObject({ token: expect.any(String) });
  expect((await POST(new Request("https://app.test/experience/access", { method: "POST", headers: { origin: "https://evil.test" } }))).status).toBe(403);
  auth.mockResolvedValue({ userId: null });
  expect((await POST(new Request("https://app.test/experience/access", { method: "POST", headers: { origin: "https://app.test" } }))).status).toBe(401);
});

test("without the shared secret X is unavailable while existing apps still load", async () => {
  vi.stubEnv("EXPERIENCE_ACCESS_SECRET", "");
  const page = await Catalogue();
  expect(page.props.accessToken).toBeNull();
  expect(page.props.services.find(service => service.id === "x")?.src).toBeNull();
  expect(page.props.services.find(service => service.id === "youtube")?.src).toContain("youtube.com");
});
