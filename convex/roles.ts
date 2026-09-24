import { requireNotTimedOut } from "./timeoutState";
import { ConvexError, v } from "convex/values";

import { ROLES, roleFor, staffRoles, type StaffRole } from "../config/roles";
import {
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";

export type SiteRole = keyof typeof ROLES;
export type RoleOverride = SiteRole;

type ReadCtx = QueryCtx | MutationCtx;

/** The table row for one account, if a CEO has ever set its role. */
export async function roleOverride(
  ctx: ReadCtx,
  clerkId: string,
): Promise<RoleOverride | null> {
  const row = await ctx.db
    .query("staffRoles")
    .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
    .unique();
  return row?.role ?? null;
}

/**
 * The effective role: the CEO-written table row when there is one, else the
 * server-owned `STAFF_ROLES` env map. The table has to win — including an
 * explicit `member` — or a CEO could never demote somebody the env map names.
 */
export async function resolveRole(
  ctx: ReadCtx,
  clerkId: string,
): Promise<SiteRole> {
  return (await roleOverride(ctx, clerkId)) ?? roleFor(clerkId);
}

export async function resolvePrivileges(ctx: ReadCtx, clerkId: string) {
  return ROLES[await resolveRole(ctx, clerkId)];
}

/**
 * The staff list for badges, the sidebar, and the CEO headcount guard: the
 * env map with every table row applied, dropping explicit `member` rows.
 * `hideBadge` is presentation only and never narrows a role's powers.
 */
export async function resolveStaffRoles(
  ctx: ReadCtx,
): Promise<{ clerkId: string; role: StaffRole; hideBadge?: true }[]> {
  const merged = new Map<string, { role: StaffRole; hideBadge?: true }>(
    staffRoles().map((entry) => [entry.clerkId, { role: entry.role }]),
  );
  for (const row of await ctx.db.query("staffRoles").collect()) {
    if (row.role === "member") merged.delete(row.clerkId);
    else
      merged.set(row.clerkId, {
        role: row.role,
        ...(row.hideBadge ? { hideBadge: true as const } : {}),
      });
  }
  return [...merged].map(([clerkId, entry]) => ({ clerkId, ...entry }));
}

/** Whether chat shows this account's staff badge. Absent row means shown. */
export async function badgeHidden(
  ctx: ReadCtx,
  clerkId: string,
): Promise<boolean> {
  const row = await ctx.db
    .query("staffRoles")
    .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
    .unique();
  return row?.hideBadge === true;
}

export async function resolveAdminClerkIds(ctx: ReadCtx): Promise<string[]> {
  return (await resolveStaffRoles(ctx))
    .filter(({ role, hideBadge }) => ROLES[role].adminBadge && !hideBadge)
    .map(({ clerkId }) => clerkId);
}

/** CEO check for mutations and CEO-only queries. Throws when not a CEO. */
export async function requireCeo(ctx: ReadCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("CEO access required.");
  if ((await resolveRole(ctx, identity.subject)) !== "ceo") {
    throw new ConvexError("CEO access required.");
  }
  await requireNotTimedOut(ctx, identity.subject);
  return identity.subject;
}

/**
 * One-time migration: copy the `STAFF_ROLES` env map into the `staffRoles`
 * table so prod staff keep their roles once the table is the editable source
 * of truth.
 *
 * Internal-only (dashboard / `convex run`), never client-callable. Idempotent:
 * accounts that already have a row — i.e. anything a CEO has set — are left
 * alone, so re-running after a partial failure is safe. Run once per
 * deployment with:
 *
 *   npx convex run roles:migrateFromEnv --prod
 */
export const migrateFromEnv = internalMutation({
  args: {},
  returns: v.object({
    inserted: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx) => {
    let inserted = 0;
    let skipped = 0;
    for (const { clerkId, role } of staffRoles()) {
      const existing = await ctx.db
        .query("staffRoles")
        .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
        .unique();
      if (existing) {
        skipped += 1;
        continue;
      }
      await ctx.db.insert("staffRoles", {
        clerkId,
        role,
        updatedAt: Date.now(),
        updatedBy: "env-migration",
      });
      inserted += 1;
    }
    return { inserted, skipped };
  },
});
