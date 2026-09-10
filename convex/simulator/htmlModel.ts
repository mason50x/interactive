import { v } from "convex/values";
export const htmlFields = {
  ownerClerkId: v.string(),
  contentHash: v.string(),
  label: v.string(),
  createdAt: v.number(),
  lastOpenedAt: v.number(),
};
export const htmlDoc = v.object({
  _id: v.id("htmlSimulatorEntries"),
  _creationTime: v.number(),
  ...htmlFields,
});
