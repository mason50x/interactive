import { expect, test } from "vitest";
import { api } from "@convex/_generated/api";
import { actor, makeConvexTest } from "../helpers/convex";

async function rows(t: ReturnType<typeof makeConvexTest>) {
  return await t.run((ctx) => ctx.db.query("preferences").collect());
}

test("mine is null signed out and null before anything has been saved", async () => {
  const t = makeConvexTest();
  expect(await t.query(api.preferences.mine, {})).toBeNull();
  expect(await actor(t, "alice").query(api.preferences.mine, {})).toBeNull();
  // A signed-out save writes nothing.
  await t.mutation(api.preferences.save, { constellation: false });
  expect(await rows(t)).toEqual([]);
});

test("save stores the six accepted fields and mine returns them without ids", async () => {
  const t = makeConvexTest();
  const alice = actor(t, "alice");
  await alice.mutation(api.preferences.save, {
    constellation: false,
    accent: "violet",
    panicEnabled: true,
    panicKey: "ctrl+shift+x",
    panicUrl: "about:blank",
    tabMask: "docs",
  });
  expect(await alice.query(api.preferences.mine, {})).toEqual({
    constellation: false,
    accent: "violet",
    panicEnabled: true,
    panicKey: "ctrl+shift+x",
    panicUrl: "about:blank",
    tabMask: "docs",
  });
  const stored = await rows(t);
  expect(stored).toHaveLength(1);
  expect(stored[0].clerkId).toBe("alice");
  // Another account sees nothing of it.
  expect(await actor(t, "bob").query(api.preferences.mine, {})).toBeNull();
});

test("a second save patches the same row and leaves untouched fields alone", async () => {
  const t = makeConvexTest();
  const alice = actor(t, "alice");
  await alice.mutation(api.preferences.save, {
    accent: "violet",
    panicEnabled: false,
  });
  await alice.mutation(api.preferences.save, { tabMask: "classroom" });
  await alice.mutation(api.preferences.save, { panicEnabled: true });
  expect(await rows(t)).toHaveLength(1);
  expect(await alice.query(api.preferences.mine, {})).toEqual({
    constellation: undefined,
    accent: "violet",
    panicEnabled: true,
    panicKey: undefined,
    panicUrl: undefined,
    tabMask: "classroom",
  });
  // A save with nothing in it is a row with nothing in it, not an error.
  const bob = actor(t, "bob");
  await bob.mutation(api.preferences.save, {});
  expect(await rows(t)).toHaveLength(2);
  expect(await bob.query(api.preferences.mine, {})).toEqual({
    constellation: undefined,
    accent: undefined,
    panicEnabled: undefined,
    panicKey: undefined,
    panicUrl: undefined,
    tabMask: undefined,
  });
});

test("panicUrl keeps about:blank, normalises http(s), and empties everything else", async () => {
  const t = makeConvexTest();
  const alice = actor(t, "alice");
  const cases: [string, string][] = [
    ["about:blank", "about:blank"],
    ["  about:blank  ", "about:blank"],
    ["https://Example.COM", "https://example.com/"],
    ["http://example.com/a/../b?x=1#frag", "http://example.com/b?x=1#frag"],
    ["  https://docs.google.com/document  ", "https://docs.google.com/document"],
    // Refused, silently: the row records an empty destination.
    ["javascript:alert(1)", ""],
    ["data:text/html,<script>alert(1)</script>", ""],
    ["about:config", ""],
    ["file:///etc/passwd", ""],
    ["not a url", ""],
    ["", ""],
  ];
  for (const [given, expected] of cases) {
    await alice.mutation(api.preferences.save, { panicUrl: given });
    expect(
      (await alice.query(api.preferences.mine, {}))?.panicUrl,
      `panicUrl ${JSON.stringify(given)}`,
    ).toBe(expected);
  }
  // Long destinations are cut at 512 characters.
  const long = `https://example.com/${"a".repeat(600)}`;
  await alice.mutation(api.preferences.save, { panicUrl: long });
  expect((await alice.query(api.preferences.mine, {}))?.panicUrl).toBe(
    long.slice(0, 512),
  );
});

test("accent, tabMask and panicKey are stored as given, bounded in length, and not checked against the id lists", async () => {
  const t = makeConvexTest();
  const alice = actor(t, "alice");
  // The module checks shape, not meaning: an unknown id is stored and the
  // client falls back to its default when it does not recognise it.
  await alice.mutation(api.preferences.save, {
    accent: "not-a-real-accent",
    tabMask: "not-a-real-mask",
    panicKey: "f9",
  });
  expect(await alice.query(api.preferences.mine, {})).toMatchObject({
    accent: "not-a-real-accent",
    tabMask: "not-a-real-mask",
    panicKey: "f9",
  });

  await alice.mutation(api.preferences.save, {
    accent: "a".repeat(40),
    tabMask: "m".repeat(40),
    panicKey: "k".repeat(80),
  });
  const mine = await alice.query(api.preferences.mine, {});
  expect(mine?.accent).toBe("a".repeat(32));
  expect(mine?.tabMask).toBe("m".repeat(32));
  expect(mine?.panicKey).toBe("k".repeat(64));
});
