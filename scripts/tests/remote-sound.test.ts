import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import {
  REMOTE_SOUND_FRESH_MS as FRESH_MS,
  SOUND_IDS,
  VOLUME_DEFAULT,
  VOLUME_MAX,
} from "../../src/lib/remote-sound";
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
    volume: VOLUME_DEFAULT,
    sentAt: Date.now(),
    ageMs: 0,
  });
  expect(await ceo.query(api.remoteSound.mine, {})).toBeNull();

  vi.setSystemTime(Date.now() + FRESH_MS + 1);
  const stale = await member.query(api.remoteSound.mine, {});
  expect(stale?.ageMs).toBe(FRESH_MS + 1);

  await ceo.mutation(api.remoteSound.play, {
    clerkId: "member",
    sound: "fart-long",
    volume: 180,
  });
  expect(await member.query(api.remoteSound.mine, {})).toMatchObject({
    sound: "fart-long",
    volume: 180,
    sentAt: Date.now(),
    ageMs: 0,
  });
  const rows = await t.run((ctx) => ctx.db.query("soundPings").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ clerkId: "member", sentBy: "ceo" });
});

test("only an admin can send, a Head Moderator never to a CEO, and only to an account that exists", async () => {
  const t = convexTest(schema, modules);
  await admit(t, "ceo", "head", "member");
  const ceo = t.withIdentity({ subject: "ceo" });
  const head = t.withIdentity({ subject: "head" });
  const member = t.withIdentity({ subject: "member" });

  for (const caller of [member, t]) {
    await expect(
      caller.mutation(api.remoteSound.play, { clerkId: "member" }),
    ).rejects.toThrow("Admin access required.");
  }
  expect(await member.query(api.remoteSound.mine, {})).toBeNull();

  // A Head Moderator holds the power over everyone but a CEO.
  await expect(
    head.mutation(api.remoteSound.play, { clerkId: "ceo" }),
  ).rejects.toThrow("Only a CEO can play a sound on a CEO's device.");
  expect(await ceo.query(api.remoteSound.mine, {})).toBeNull();
  await head.mutation(api.remoteSound.play, { clerkId: "member" });
  expect(await member.query(api.remoteSound.mine, {})).toMatchObject({
    sound: "beep",
  });
  expect(
    await t.run((ctx) => ctx.db.query("soundPings").unique()),
  ).toMatchObject({ clerkId: "member", sentBy: "head" });

  await expect(
    ceo.mutation(api.remoteSound.play, { clerkId: "nobody" }),
  ).rejects.toThrow("User not found.");

  // A CEO can beep themselves, which is how the feature is tried alone.
  await ceo.mutation(api.remoteSound.play, { clerkId: "ceo" });
  expect(await ceo.query(api.remoteSound.mine, {})).toMatchObject({
    sound: "beep",
  });
});

test("the sound has to be in the catalogue and the volume in range", async () => {
  const t = convexTest(schema, modules);
  await admit(t, "ceo", "member");
  const ceo = t.withIdentity({ subject: "ceo" });
  const member = t.withIdentity({ subject: "member" });

  await expect(
    ceo.mutation(api.remoteSound.play, { clerkId: "member", sound: "kazoo" }),
  ).rejects.toThrow("Unknown sound.");
  for (const volume of [VOLUME_MAX + 10, 0, 125.5, -100]) {
    await expect(
      ceo.mutation(api.remoteSound.play, { clerkId: "member", volume }),
    ).rejects.toThrow("Volume must be a whole number");
  }
  expect(await member.query(api.remoteSound.mine, {})).toBeNull();

  // Every catalogue entry is accepted, and the loudest boost is allowed.
  for (const sound of SOUND_IDS) {
    await ceo.mutation(api.remoteSound.play, {
      clerkId: "member",
      sound,
      volume: VOLUME_MAX,
    });
  }
  expect(await member.query(api.remoteSound.mine, {})).toMatchObject({
    sound: SOUND_IDS[SOUND_IDS.length - 1],
    volume: VOLUME_MAX,
  });
  expect(new Set(SOUND_IDS).size).toBe(SOUND_IDS.length);
});

test("a row written before volumes existed plays at the default", async () => {
  const t = convexTest(schema, modules);
  await admit(t, "member");
  await t.run((ctx) =>
    ctx.db.insert("soundPings", {
      clerkId: "member",
      sound: "beep",
      sentBy: "ceo",
      sentAt: Date.now(),
    }),
  );
  const member = t.withIdentity({ subject: "member" });
  expect(await member.query(api.remoteSound.mine, {})).toMatchObject({
    sound: "beep",
    volume: VOLUME_DEFAULT,
  });
});
