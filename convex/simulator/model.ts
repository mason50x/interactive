import { v } from "convex/values";
export const ENGINE_BUILD = "c60e138";
export const STATE_BYTES = 199608;
export const STATE_HEADER = 1800906722;
export const MAX_SAVE_BYTES = 512 * 1024;
export const mode = v.union(v.literal("mono"), v.literal("color"));
export const slot = v.union(
  v.literal("auto"),
  v.literal("previous"),
  v.literal("manual1"),
  v.literal("manual2"),
  v.literal("manual3"),
);
export const writableSlot = v.union(
  v.literal("auto"),
  v.literal("manual1"),
  v.literal("manual2"),
  v.literal("manual3"),
);
export const entryFields = {
  ownerClerkId: v.string(),
  contentHash: v.string(),
  label: v.string(),
  source: v.union(v.literal("builtin"), v.literal("imported")),
  builtinId: v.optional(v.string()),
  mode,
  createdAt: v.number(),
  lastOpenedAt: v.number(),
  updatedAt: v.number(),
  revision: v.number(),
  latestSavedAt: v.optional(v.number()),
};
export const envelopeFields = {
  captureId: v.string(),
  engineBuild: v.string(),
  formatVersion: v.number(),
  capturedAt: v.number(),
  checkpoint: v.bytes(),
  battery: v.optional(v.bytes()),
};
export const saveFields = {
  ownerClerkId: v.string(),
  entryId: v.id("simulatorEntries"),
  slot,
  revision: v.number(),
  savedAt: v.number(),
  ...envelopeFields,
};
export const entryDoc = v.object({
  _id: v.id("simulatorEntries"),
  _creationTime: v.number(),
  ...entryFields,
});
export const saveDoc = v.object({
  _id: v.id("simulatorSaves"),
  _creationTime: v.number(),
  ...saveFields,
});
export const commitResult = v.union(
  v.object({
    ok: v.literal(true),
    revision: v.number(),
    captureId: v.string(),
  }),
  v.object({
    ok: v.literal(false),
    reason: v.union(
      v.literal("conflict"),
      v.literal("deleted"),
      v.literal("rate-limit"),
    ),
    revision: v.number(),
    retryAfter: v.optional(v.number()),
  }),
);
