import { ConvexError } from "convex/values";

import { internal } from "./_generated/api";
import {
  action as rawAction,
  mutation as rawMutation,
  query as rawQuery,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { RESTRICTED_ERROR, restrictionRow } from "./restrictionState";
import { UNINVITED_ERROR, isUninvited } from "./inviteState";

/**
 * The public `query`, `mutation` and `action` builders every module imports
 * instead of `_generated/server`'s.
 *
 * Each one refuses a restricted account (see `restrictions.ts`) before the
 * handler runs, so a ban or an error screen is the server's and not an
 * overlay a client could delete. One choke point rather than a check beside
 * every handler: a function added later is covered without anyone remembering
 * to be. Internal functions are untouched — nothing a client can call is.
 *
 * `restrictions.mine` is the one public function built on the raw builder,
 * because it is how the client learns which screen to show.
 *
 * They also refuse an account that has not redeemed an invite code yet, or
 * whose row does not exist yet, so the invite gate is the server's too. The
 * `preInvite*` builders below are the few a gated account needs to create its
 * row, see its own settings, and get through the gate; they still refuse a
 * restricted one.
 */

type Definition<Ctx> =
  | ((ctx: Ctx, args: unknown) => unknown)
  | { handler: (ctx: Ctx, args: unknown) => unknown };

function guarded<Ctx>(
  definition: Definition<Ctx>,
  check: (ctx: Ctx) => Promise<void>,
) {
  const spec =
    typeof definition === "function" ? { handler: definition } : definition;
  return {
    ...spec,
    handler: async (ctx: Ctx, args: unknown) => {
      await check(ctx);
      return spec.handler(ctx, args);
    },
  };
}

async function checkRestrictedDb(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity && (await restrictionRow(ctx, identity.subject)))
    throw new ConvexError(RESTRICTED_ERROR);
}

async function checkDb(ctx: QueryCtx | MutationCtx) {
  await checkRestrictedDb(ctx);
  const identity = await ctx.auth.getUserIdentity();
  if (identity && (await isUninvited(ctx, identity.subject)))
    throw new ConvexError(UNINVITED_ERROR);
}

async function checkRestrictedAction(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (
    identity &&
    (await ctx.runQuery(internal.restrictions.isRestricted, {
      clerkId: identity.subject,
    }))
  )
    throw new ConvexError(RESTRICTED_ERROR);
}

async function checkAction(ctx: ActionCtx) {
  await checkRestrictedAction(ctx);
  const identity = await ctx.auth.getUserIdentity();
  if (
    identity &&
    (await ctx.runQuery(internal.invites.isUninvited, {
      clerkId: identity.subject,
    }))
  )
    throw new ConvexError(UNINVITED_ERROR);
}

export const query = ((definition: Definition<QueryCtx>) =>
  rawQuery(guarded(definition, checkDb) as never)) as unknown as typeof rawQuery;

export const mutation = ((definition: Definition<MutationCtx>) =>
  rawMutation(
    guarded(definition, checkDb) as never,
  )) as unknown as typeof rawMutation;

export const action = ((definition: Definition<ActionCtx>) =>
  rawAction(
    guarded(definition, checkAction) as never,
  )) as unknown as typeof rawAction;

export const preInviteQuery = ((definition: Definition<QueryCtx>) =>
  rawQuery(
    guarded(definition, checkRestrictedDb) as never,
  )) as unknown as typeof rawQuery;

export const preInviteMutation = ((definition: Definition<MutationCtx>) =>
  rawMutation(
    guarded(definition, checkRestrictedDb) as never,
  )) as unknown as typeof rawMutation;

export const preInviteAction = ((definition: Definition<ActionCtx>) =>
  rawAction(
    guarded(definition, checkRestrictedAction) as never,
  )) as unknown as typeof rawAction;
