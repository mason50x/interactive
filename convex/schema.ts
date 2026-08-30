import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    // Clerk user id — this is `identity.subject` on the Convex side
    // and `data.id` in Clerk webhook payloads.
    clerkId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  }).index("byClerkId", ["clerkId"]),
});
