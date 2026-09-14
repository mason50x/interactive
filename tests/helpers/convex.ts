/// <reference types="vite/client" />
/**
 * The Convex test harness every backend test starts from.
 *
 * `convex-test` needs the schema and a map of every function module, and the
 * rate limiter component has to be registered separately or any mutation that
 * touches a quota throws. Each test file used to repeat that wiring, along
 * with the same two seeded profiles; this is the one copy.
 */
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "@convex/schema";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

/** Every Convex module, keyed by path, as `convex-test` expects. */
export const modules = import.meta.glob("../../convex/**/*.ts");

/** Named so the schema-aware type can be read off it below. */
function createHarness() {
  return convexTest(schema, modules);
}

export type ConvexHarness = ReturnType<typeof createHarness>;
export type ConvexActor = ReturnType<ConvexHarness["withIdentity"]>;

/**
 * A fresh in-memory deployment. `rateLimited` registers the rate limiter
 * component, which anything sending messages or spending bot credits needs.
 */
export function makeConvexTest({ rateLimited = false } = {}): ConvexHarness {
  const t = createHarness();
  if (rateLimited) rateLimiter.register(t);
  return t;
}

/** A signed-in caller for `clerkId`. */
export function actor(t: ConvexHarness, clerkId: string): ConvexActor {
  return t.withIdentity({ subject: clerkId });
}

/** Rows in `users`, one per id, with nothing else filled in. */
export async function seedUsers(
  t: ConvexHarness,
  clerkIds: readonly string[],
): Promise<void> {
  await t.run(async (ctx) => {
    for (const clerkId of clerkIds) await ctx.db.insert("users", { clerkId });
  });
}

/**
 * Chat profiles whose handle is the id, established long enough ago and with
 * enough history that the new-account moderation limits do not apply.
 */
export async function seedChatProfiles(
  t: ConvexHarness,
  clerkIds: readonly string[],
): Promise<void> {
  await t.run(async (ctx) => {
    for (const clerkId of clerkIds) {
      await ctx.db.insert("chatProfiles", {
        clerkId,
        handle: clerkId,
        handleKey: clerkId,
        createdAt: 0,
        messagesSent: 100,
      });
    }
  });
}

/**
 * Two members of Everyone, plus the bot DM each gets on joining.
 *
 * `global` is the shared room and `dm` is Alice's conversation with the bot,
 * which is what the bot and unread tests exercise.
 */
export async function seedChatPair(t: ConvexHarness): Promise<{
  alice: ConvexActor;
  bob: ConvexActor;
  global: Id<"conversations">;
  dm: Id<"conversations">;
}> {
  await seedChatProfiles(t, ["alice", "bob"]);
  const alice = actor(t, "alice");
  const bob = actor(t, "bob");
  await alice.mutation(api.chat.profiles.joinGlobal, {});
  await bob.mutation(api.chat.profiles.joinGlobal, {});
  const list = await alice.query(api.chat.conversations.list, {});
  return { alice, bob, global: list[0]._id, dm: list[1]._id };
}
