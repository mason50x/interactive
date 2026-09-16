import { beforeEach, expect, test, vi } from "vitest";

const { protect, getToken, fetchQuery, findTvShow } = vi.hoisted(() => ({
  protect: vi.fn(),
  getToken: vi.fn(),
  fetchQuery: vi.fn(),
  findTvShow: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: Object.assign(async () => ({ getToken }), { protect }),
}));
vi.mock("convex/nextjs", () => ({ fetchQuery }));
vi.mock("@/lib/tv", () => ({ TV_SHOWS: [], findTvShow }));
vi.mock("@/components/app/tv/tv-browser", () => ({ TvBrowser: () => null }));
vi.mock("@/components/app/tv/tv-player", () => ({ TvPlayer: () => null }));
vi.mock("@/components/app/tv/entertainment-setup", () => ({
  EntertainmentSetup: () => null,
}));

import { canAccessEntertainment } from "@/lib/entertainment-access";
import Layout from "@/app/(app)/entertainment/layout";
import Catalogue from "@/app/(app)/entertainment/page";
import Player, {
  generateMetadata,
} from "@/app/(app)/entertainment/[slug]/page";
import { EntertainmentSoon } from "@/components/app/tv/entertainment-soon";
import { EntertainmentSetup } from "@/components/app/tv/entertainment-setup";
import { TvPlayer } from "@/components/app/tv/tv-player";

beforeEach(() => {
  vi.clearAllMocks();
  protect.mockResolvedValue({});
  getToken.mockResolvedValue("verified-clerk-token");
  fetchQuery.mockResolvedValue(false);
  findTvShow.mockReturnValue({ slug: "test-show", title: "Staff-only show" });
});

test("members get SOON on catalogue, layout, and direct player links without show data", async () => {
  expect((await Layout({ children: "private content" })).type).toBe(
    EntertainmentSoon,
  );
  expect((await Catalogue()).type).toBe(EntertainmentSoon);
  expect(
    (await Player({ params: Promise.resolve({ slug: "test-show" }) })).type,
  ).toBe(EntertainmentSoon);
  expect(
    await generateMetadata({ params: Promise.resolve({ slug: "test-show" }) }),
  ).toEqual({ title: "Entertainment" });
  expect(findTvShow).not.toHaveBeenCalled();
});

test("verified staff can see the setup and player", async () => {
  fetchQuery.mockResolvedValue(true);
  expect((await Layout({ children: "private content" })).type).toBe(
    EntertainmentSetup,
  );
  expect(
    (await Player({ params: Promise.resolve({ slug: "test-show" }) })).type,
  ).toBe(TvPlayer);
  expect(fetchQuery).toHaveBeenCalledWith(
    expect.anything(),
    {},
    { token: "verified-clerk-token" },
  );
  expect(protect).toHaveBeenCalled();
});

test("missing token denies access without querying as an anonymous user", async () => {
  getToken.mockResolvedValue(null);
  expect(await canAccessEntertainment()).toBe(false);
  expect(fetchQuery).not.toHaveBeenCalled();
});

test("authentication or authorization service failure cannot return protected content", async () => {
  protect.mockRejectedValueOnce(new Error("Sign in required"));
  await expect(Catalogue()).rejects.toThrow("Sign in required");
  fetchQuery.mockRejectedValueOnce(new Error("Authorization unavailable"));
  await expect(
    Player({ params: Promise.resolve({ slug: "test-show" }) }),
  ).rejects.toThrow("Authorization unavailable");
  expect(findTvShow).not.toHaveBeenCalled();
});
