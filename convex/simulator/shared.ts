import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  ENGINE_BUILD,
  STATE_BYTES,
  STATE_HEADER,
  MAX_SAVE_BYTES,
} from "./model";
export async function caller(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Sign in to access your progress.");
  const user = await ctx.db
    .query("users")
    .withIndex("byClerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!user) throw new ConvexError("Your account is not available.");
  return identity.subject;
}
export async function owned(
  ctx: QueryCtx | MutationCtx,
  entryId: Id<"simulatorEntries">,
) {
  const owner = await caller(ctx);
  const entry = await ctx.db.get(entryId);
  if (entry && entry.ownerClerkId !== owner)
    throw new ConvexError("Progress is not available.");
  return entry;
}
export function hash(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value))
    throw new ConvexError("Invalid content identifier.");
}
export function label(value: string) {
  const clean = value.trim();
  if (!clean || clean.length > 60 || /[\x00-\x1f]/.test(clean))
    throw new ConvexError("Use a label between 1 and 60 characters.");
  return clean;
}
export function validateSave(s: {
  captureId: string;
  engineBuild: string;
  formatVersion: number;
  capturedAt: number;
  checkpoint: ArrayBuffer;
  battery?: ArrayBuffer;
}) {
  if (
    !/^[a-zA-Z0-9-]{1,80}$/.test(s.captureId) ||
    !Number.isFinite(s.capturedAt) ||
    s.capturedAt < 0
  )
    throw new ConvexError("Invalid capture.");
  if (
    s.engineBuild !== ENGINE_BUILD ||
    s.formatVersion !== 1 ||
    s.checkpoint.byteLength !== STATE_BYTES ||
    new DataView(s.checkpoint).getUint32(0, true) !== STATE_HEADER
  )
    throw new ConvexError("This progress format is incompatible.");
  if (
    s.checkpoint.byteLength + (s.battery?.byteLength ?? 0) > MAX_SAVE_BYTES ||
    (s.battery &&
      ![0, 512, 2048, 8192, 32768, 65536, 131072].includes(
        s.battery.byteLength,
      ))
  )
    throw new ConvexError("Progress is too large or invalid.");
}
