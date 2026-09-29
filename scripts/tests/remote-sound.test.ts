import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { REMOTE_SOUND_FRESH_MS as FRESH_MS } from "../../src/lib/remote-sound";
import { admit } from "./invited";

const modules = import.meta.glob("../../convex/**/*.ts");

beforeEach(() => {
  vi.stubEnv(
    "STAFF_ROLES",
    JSON.stringify({ ceo: "ceo", head: "head_moderator" }),
  );
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 8, 29, 12));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

test("a CEO's beep reaches only the target, ages on the server, and keeps one row per account", async () => {
  const t = convexTest(schema, modules);
  await admit(t, "ceo", "member");
  const ceo = t.withIdentity({ subject: "ceo" });
  const member = t.withIdentity({ subject: "member" });

  expect(await member.query(api.remoteSound.mine, {})).toBeNull();

  await ceo.mutation(api.remoteSound.play, { clerkId: "member" });
  expect(await member.query(api.remoteSound.mine, {})).toEqual({
    sound: "beep",
    sentAt: Date.now(),
    ageMs: 0,
  });
  expect(await ceo.query(api.remoteSound.mine, {})).toBeNull();

  vi.setSystemTime(Date.now() + FRESH_MS + 1);
  const stale = await member.query(api.remoteSound.mine, {});
  expect(stale?.ageMs).toBe(FRESH_MS + 1);

  await ceo.mutation(api.remoteSound.play, {
    clerkId: "member",
    sound: "beep",
  });
  expect(await member.query(api.remoteSound.mine, {})).toMatchObject({
    sentAt: Date.now(),
    ageMs: 0,
  });
  const rows = await t.run((ctx) => ctx.db.query("soundPings").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ clerkId: "member", sentBy: "ceo" });
});

test("only a CEO can send, and only to an account that exists", async () => {
  const t = convexTest(schema, modules);
  await admit(t, "ceo", "head", "member");
  const ceo = t.withIdentity({ subject: "ceo" });
  const head = t.withIdentity({ subject: "head" });
  const member = t.withIdentity({ subject: "member" });

  for (const caller of [head, member, t]) {
    await expect(
      caller.mutation(api.remoteSound.play, { clerkId: "member" }),
    ).rejects.toThrow("CEO access required.");
  }
  expect(await member.query(api.remoteSound.mine, {})).toBeNull();

  await expect(
    ceo.mutation(api.remoteSound.play, { clerkId: "nobody" }),
  ).rejects.toThrow("User not found.");

  // A CEO can beep themselves, which is how the feature is tried alone.
  await ceo.mutation(api.remoteSound.play, { clerkId: "ceo" });
  expect(await ceo.query(api.remoteSound.mine, {})).toMatchObject({
    sound: "beep",
  });
});
