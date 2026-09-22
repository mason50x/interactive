import { v } from "convex/values";

export const publishedFields = {
  label: v.string(),
  description: v.string(),
  storageId: v.id("_storage"),
  contentHash: v.string(),
  byteLength: v.number(),
  revision: v.number(),
  createdBy: v.string(),
  updatedBy: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  publishKey: v.string(),
  lastOperationId: v.string(),
};
// Public listings contain only small display fields, never source or download URLs.
export const publishedSummary = v.object({
  _id: v.id("publishedHtmlSimulators"),
  label: v.string(),
  description: v.string(),
  contentHash: v.string(),
  byteLength: v.number(),
  revision: v.number(),
  updatedAt: v.number(),
});
