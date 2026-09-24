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

import Layout from "@/app/(app)/tv/layout";
import Catalogue from "@/app/(app)/tv/page";
import Player, {
  generateMetadata,
} from "@/app/(app)/tv/[slug]/page";
import { EntertainmentSetup } from "@/components/app/tv/entertainment-setup";
import { TvPlayer } from "@/components/app/tv/tv-player";

beforeEach(() => {
  vi.clearAllMocks();
  protect.mockResolvedValue({});
  getToken.mockResolvedValue("verified-clerk-token");
  fetchQuery.mockResolvedValue(false);
  findTvShow.mockReturnValue({ slug: "test-show", title: "Available show" });
});

test("all members can access setup, catalogue, player, and show metadata without staff authorization", async () => {
  expect((await Layout({ children: "content" })).type).toBe(EntertainmentSetup);
  expect((await Catalogue()).props.children.props.shows).toEqual([]);
  expect(
    (await Player({ params: Promise.resolve({ slug: "test-show" }) })).type,
  ).toBe(TvPlayer);
  expect(
    await generateMetadata({ params: Promise.resolve({ slug: "test-show" }) }),
  ).toEqual({ title: "Available show" });
  expect(protect).toHaveBeenCalledTimes(4);
  expect(getToken).not.toHaveBeenCalled();
  expect(fetchQuery).not.toHaveBeenCalled();
});

test("a missing Convex token does not prevent authenticated members from watching", async () => {
  getToken.mockResolvedValue(null);
  expect(
    (await Player({ params: Promise.resolve({ slug: "test-show" }) })).type,
  ).toBe(TvPlayer);
  expect(fetchQuery).not.toHaveBeenCalled();
});

test("signed-out requests still require authentication on every entry point", async () => {
  protect.mockRejectedValue(new Error("Sign in required"));
  await expect(Layout({ children: "content" })).rejects.toThrow(
    "Sign in required",
  );
  await expect(Catalogue()).rejects.toThrow("Sign in required");
  await expect(
    Player({ params: Promise.resolve({ slug: "test-show" }) }),
  ).rejects.toThrow("Sign in required");
  await expect(
    generateMetadata({ params: Promise.resolve({ slug: "test-show" }) }),
  ).rejects.toThrow("Sign in required");
  expect(findTvShow).not.toHaveBeenCalled();
});
