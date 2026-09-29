import { requireNotTimedOut } from "./timeoutState";
import { ConvexError, v } from "convex/values";

import {
  isAdminRole,
  ROLES,
  roleFor,
  staffRoles,
  type AdminRole,
  type StaffRole,
} from "../config/roles";
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

export type AdminCaller = { clerkId: string; role: AdminRole };

/**
 * Admin check for mutations and admin-only queries: CEOs and Head Moderators
 * pass, everybody else throws. A Head Moderator holds every CEO power except
 * over CEOs themselves; the features that touch one account ask
 * `outrankedByCeo` before acting on it.
 */
export async function requireAdmin(ctx: ReadCtx): Promise<AdminCaller> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Admin access required.");
  const role = await resolveRole(ctx, identity.subject);
  if (!isAdminRole(role)) throw new ConvexError("Admin access required.");
  await requireNotTimedOut(ctx, identity.subject);
  return { clerkId: identity.subject, role };
}

/**
 * Whether `clerkId` is a CEO the caller does not outrank: true for a Head
 * Moderator acting on any CEO, false for a CEO acting on anyone.
 */
export async function outrankedByCeo(
  ctx: ReadCtx,
  caller: AdminCaller,
  clerkId: string,
): Promise<boolean> {
  return caller.role !== "ceo" && (await resolveRole(ctx, clerkId)) === "ceo";
}

/**
 * The gate on the site announcement, which CEOs and Head Moderators share.
 * The same shape as `requireCeo`: signed in, holding the role, and not timed
 * out — a timed-out manager cannot take the site down on their way out.
 */
export async function requireAnnouncementManager(
  ctx: ReadCtx,
): Promise<{ clerkId: string; role: "ceo" | "head_moderator" }> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("CEO or Head Moderator access required.");
  const role = await resolveRole(ctx, identity.subject);
  if (role !== "ceo" && role !== "head_moderator")
    throw new ConvexError("CEO or Head Moderator access required.");
  await requireNotTimedOut(ctx, identity.subject);
  return { clerkId: identity.subject, role };
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
