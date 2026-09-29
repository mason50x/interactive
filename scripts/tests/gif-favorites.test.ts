/// <reference types="vite/client" />
import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { MAX_SAVED } from "../../convex/chat/gifFavorites";
import { admit } from "./invited";

const modules = import.meta.glob("../../convex/**/*.ts");
afterEach(() => vi.useRealTimers());

function klipy(slug: string) {
  return {
    gif: {
      slug,
      url: `https://static.klipy.com/ii/${slug}/md.webp`,
      width: 480,
      height: 270,
      title: `A ${slug} GIF`,
    },
    preview: {
      url: `https://static2.klipy.com/ii/${slug}/sm.webp`,
      width: 200,
      height: 112,
    },
  };
}

test("a heart saves a GIF for its own account, once, newest first, until it is removed", async () => {
  const t = convexTest(schema, modules);
  await admit(t, "me", "other");
  const me = t.withIdentity({ subject: "me" });
  const other = t.withIdentity({ subject: "other" });

  expect(await me.query(api.chat.gifFavorites.mine, {})).toEqual([]);
  expect(await me.mutation(api.chat.gifFavorites.save, klipy("first"))).toEqual(
    { ok: true },
  );
  expect(
    await me.mutation(api.chat.gifFavorites.save, klipy("second")),
  ).toEqual({ ok: true });
  // Hearting something already hearted is fine and changes nothing.
  expect(await me.mutation(api.chat.gifFavorites.save, klipy("first"))).toEqual(
    { ok: true },
  );

  const mine = await me.query(api.chat.gifFavorites.mine, {});
  expect(mine.map((item) => item.slug)).toEqual(["second", "first"]);
  expect(mine[1]).toEqual({
    slug: "first",
    title: "A first GIF",
    preview: klipy("first").preview,
    gif: klipy("first").gif,
  });
  expect(await other.query(api.chat.gifFavorites.mine, {})).toEqual([]);

  await me.mutation(api.chat.gifFavorites.remove, { slug: "first" });
  await me.mutation(api.chat.gifFavorites.remove, { slug: "never-saved" });
  expect(
    (await me.query(api.chat.gifFavorites.mine, {})).map((item) => item.slug),
  ).toEqual(["second"]);
  // Another account cannot un-heart mine.
  await other.mutation(api.chat.gifFavorites.remove, { slug: "second" });
  expect(await me.query(api.chat.gifFavorites.mine, {})).toHaveLength(1);
});

test("only KLIPY links are kept, and only while signed in", async () => {
  const t = convexTest(schema, modules);
  await admit(t, "me");
  const me = t.withIdentity({ subject: "me" });

  const elsewhere = klipy("elsewhere");
  elsewhere.gif.url = "https://example.com/not-klipy.gif";
  expect(await me.mutation(api.chat.gifFavorites.save, elsewhere)).toEqual({
    ok: false,
    refusal: "gif",
  });

  const badPreview = klipy("preview");
  badPreview.preview.url = "http://static.klipy.com/plain.webp";
  expect(await me.mutation(api.chat.gifFavorites.save, badPreview)).toEqual({
    ok: false,
    refusal: "gif",
  });

  const tall = klipy("tall");
  tall.preview.height = 5000;
  expect(await me.mutation(api.chat.gifFavorites.save, tall)).toEqual({
    ok: false,
    refusal: "gif",
  });

  expect(await t.mutation(api.chat.gifFavorites.save, klipy("anon"))).toEqual({
    ok: false,
    refusal: "signed-out",
  });
  expect(await t.query(api.chat.gifFavorites.mine, {})).toEqual([]);
  expect(await me.query(api.chat.gifFavorites.mine, {})).toEqual([]);
});

test("the saved list is capped, and the cap is a refusal rather than a silent drop", async () => {
  const t = convexTest(schema, modules);
  await admit(t, "me");
  const me = t.withIdentity({ subject: "me" });
  await t.run(async (ctx) => {
    for (let i = 0; i < MAX_SAVED; i++) {
      await ctx.db.insert("gifFavorites", {
        clerkId: "me",
        ...klipy(`gif${i}`),
      });
    }
  });
  expect(
    await me.mutation(api.chat.gifFavorites.save, klipy("one-more")),
  ).toEqual({ ok: false, refusal: "full" });
  // Still saved: a repeat of one already in the list is not a new row.
  expect(await me.mutation(api.chat.gifFavorites.save, klipy("gif3"))).toEqual({
    ok: true,
  });
  expect(await me.query(api.chat.gifFavorites.mine, {})).toHaveLength(
    MAX_SAVED,
  );
  await me.mutation(api.chat.gifFavorites.remove, { slug: "gif3" });
  expect(
    await me.mutation(api.chat.gifFavorites.save, klipy("one-more")),
  ).toEqual({ ok: true });
  expect((await me.query(api.chat.gifFavorites.mine, {}))[0]?.slug).toBe(
    "one-more",
  );
});

test("an account purge drains its saved GIFs and nobody else's", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (let i = 0; i < 150; i++) {
      await ctx.db.insert("gifFavorites", {
        clerkId: "gone",
        ...klipy(`gif${i}`),
      });
    }
    await ctx.db.insert("gifFavorites", { clerkId: "stays", ...klipy("kept") });
  });
  await t.mutation(internal.accountCleanup.purge, {
    clerkId: "gone",
    stage: 16,
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await t.run(async (ctx) => {
    const rows = await ctx.db.query("gifFavorites").take(500);
    expect(rows.map((row) => row.clerkId)).toEqual(["stays"]);
  });
});
