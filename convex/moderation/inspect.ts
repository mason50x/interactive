import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { screen, type SendContext } from "./verdict";

/**
 * Running the filter against a string, from the command line.
 *
 * This repository has no test runner, and a moderation system that cannot be
 * asked what it would do is a moderation system that gets tuned by sending
 * messages to real people and watching what happens to them. So:
 *
 *     npx convex run moderation/inspect:dryRun '{"body":"f.u.c.k"}'
 *
 * It reads nothing and writes nothing — the context below is invented, not
 * loaded — which is what makes it safe to point at anything and the reason it
 * is an `internalQuery` rather than a public one. The lexicon is not something
 * a signed-in browser gets to interrogate a word at a time.
 */
export const dryRun = internalQuery({
  args: {
    body: v.string(),
    surface: v.optional(
      v.union(v.literal("global"), v.literal("dm"), v.literal("group")),
    ),
    /** Verified synthetic handles to omit from the lexicon, without `@`. */
    lexiconExemptMentions: v.optional(v.array(v.string())),
  },
  handler: async (
    _ctx,
    { body, surface, lexiconExemptMentions },
  ) => {
    const now = Date.now();
    const context: SendContext = {
      surface: surface ?? "global",
      conversationId: "dry-run",
      now,
      // Old enough and busy enough to clear the new-account gates, so what
      // comes back is a judgement about the text and nothing else.
      createdAt: now - 30 * 24 * 60 * 60 * 1000,
      messagesSent: 50,
      recent: [],
      lexiconExemptMentions:
        lexiconExemptMentions === undefined
          ? undefined
          : new Set(lexiconExemptMentions),
    };
    return screen(body, context);
  },
});
