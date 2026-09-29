import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { mutation, query } from "../functions";
import { checkGif, gifValidator, KLIPY_MEDIA_HOST } from "./messages";

/**
 * The GIFs an account has hearted in the picker.
 *
 * A small, bounded list that belongs to one person: the row is always found
 * by the caller's own identity, never by an id from the client, so there is
 * nothing here to address but your own. `MAX_SAVED` is the whole storage
 * story — past it a save is refused rather than quietly dropping the oldest,
 * because a heart that silently un-hearts something else is worse than a
 * heart that says no. No rate limit beyond that: each call is one indexed
 * lookup and, at most, one small row.
 *
 * What is kept is the same thing a message keeps — KLIPY's links, checked
 * against KLIPY's hosts — and never the media. See `gif` in `messages.ts`.
 */
export const MAX_SAVED = 200;

const previewValidator = v.object({
  url: v.string(),
  width: v.number(),
  height: v.number(),
});

/** One saved GIF, in the shape the picker draws its grid from. */
const savedValidator = v.object({
  slug: v.string(),
  title: v.string(),
  preview: previewValidator,
  gif: gifValidator,
});

export type SavedGif = {
  slug: string;
  title: string;
  preview: { url: string; width: number; height: number };
  gif: { slug: string; url: string; width: number; height: number; title?: string };
};

function present(row: Doc<"gifFavorites">): SavedGif {
  return {
    slug: row.gif.slug,
    title: row.gif.title ?? "",
    preview: row.preview,
    gif: row.gif,
  };
}

/**
 * The grid rendition, held to the same line as the message one: HTTPS, on
 * KLIPY's CDN, with sides that could be a picture.
 */
function checkPreview(preview: { url: string; width: number; height: number }) {
  if (preview.url.length > 500) return null;
  let url: URL;
  try {
    url = new URL(preview.url);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !KLIPY_MEDIA_HOST.test(url.hostname) || url.username || url.password || url.port) return null;
  for (const side of [preview.width, preview.height]) {
    if (!Number.isInteger(side) || side < 1 || side > 4096) return null;
  }
  return { url: preview.url, width: preview.width, height: preview.height };
}

/** Newest first, which is also the order the picker's saved row shows them in. */
export const mine = query({
  args: {},
  returns: v.array(savedValidator),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const rows = await ctx.db
      .query("gifFavorites")
      .withIndex("byClerkId", (q) => q.eq("clerkId", identity.subject))
      .order("desc")
      .take(MAX_SAVED);
    return rows.map(present);
  },
});

/**
 * Hearts a GIF. Saving one that is already saved is a no-op that still says
 * `ok`, so two quick taps on two tabs do not end in an error nobody caused.
 */
export const save = mutation({
  args: { gif: gifValidator, preview: previewValidator },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({
      ok: v.literal(false),
      refusal: v.union(v.literal("signed-out"), v.literal("gif"), v.literal("full")),
    }),
  ),
  handler: async (ctx, { gif: sentGif, preview: sentPreview }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { ok: false as const, refusal: "signed-out" as const };

    const gif = checkGif(sentGif);
    const preview = checkPreview(sentPreview);
    if (gif === null || preview === null) return { ok: false as const, refusal: "gif" as const };

    const existing = await ctx.db
      .query("gifFavorites")
      .withIndex("byClerkIdAndSlug", (q) => q.eq("clerkId", identity.subject).eq("gif.slug", gif.slug))
      .unique();
    if (existing !== null) return { ok: true as const };

    const kept = await ctx.db
      .query("gifFavorites")
      .withIndex("byClerkId", (q) => q.eq("clerkId", identity.subject))
      .take(MAX_SAVED);
    if (kept.length >= MAX_SAVED) return { ok: false as const, refusal: "full" as const };

    await ctx.db.insert("gifFavorites", { clerkId: identity.subject, gif, preview });
    return { ok: true as const };
  },
});

/** Un-hearts a GIF. Removing one that is not saved is nothing to complain about. */
export const remove = mutation({
  args: { slug: v.string() },
  returns: v.null(),
  handler: async (ctx, { slug }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const existing = await ctx.db
      .query("gifFavorites")
      .withIndex("byClerkIdAndSlug", (q) => q.eq("clerkId", identity.subject).eq("gif.slug", slug))
      .unique();
    if (existing !== null) await ctx.db.delete(existing._id);
    return null;
  },
});
