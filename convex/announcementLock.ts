import { announcementRow, type ReadCtx } from "./announcementState";
import { isAdminRole } from "../config/roles";
import { resolveRole } from "./roles";

/**
 * Whether this account keeps the app while a full-screen announcement is up.
 * Admins (CEOs, Co-Owners, and Head Moderators) do, because they are the ones
 * who turn it off; an announcement that locked them out too could never be
 * lifted from the page that lifts it.
 */
export async function managesAnnouncement(ctx: ReadCtx, clerkId: string) {
  return isAdminRole(await resolveRole(ctx, clerkId));
}

/**
 * Whether a full-screen announcement is live and this account is not exempt.
 * The row is read first and the role only when it has to be, so the check
 * every function makes costs one read of a one-row table while nothing is up.
 */
export async function lockedOut(ctx: ReadCtx, clerkId: string) {
  const row = await announcementRow(ctx);
  if (!row?.enabled || row.display !== "screen") return false;
  return !(await managesAnnouncement(ctx, clerkId));
}
