import type { MutationCtx, QueryCtx } from "./_generated/server";

/**
 * What every public function throws for a caller the announcement has locked
 * out. A plain string so existing `error.data` readers show something
 * sensible, and a fixed one so `AnnouncementGate` can recognise it and swallow
 * the error rather than crash.
 *
 * Nothing but types is imported here, because the client gate imports this
 * module for the constant; the role-aware half lives in `announcementLock.ts`.
 */
export const ANNOUNCEMENT_ERROR = "The site is showing an announcement right now.";

export type ReadCtx = QueryCtx | MutationCtx;

/** The single row, or `null` before the first save. */
export async function announcementRow(ctx: ReadCtx) {
  return ctx.db.query("siteAnnouncement").first();
}
