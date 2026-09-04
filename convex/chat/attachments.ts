import { v } from "convex/values";
import { hasAccepted } from "../agreement";
import { imagesEnabled } from "../features";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  mutation,
  type MutationCtx,
} from "../_generated/server";
import { inspectImage, moderate } from "../moderation/images";
import {
  IMAGE_TTL_MS,
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_EDGE,
  MAX_UNSENT_IMAGES,
} from "../moderation/limits";
import type { Refusal } from "../moderation/rules";
import { callerProfile, deleteAttachment, profileFor } from "./shared";

/**
 * Getting a picture in, and looking at it before anybody else does.
 *
 * ## The three steps, and why there are three
 *
 * A picture reaches a message in three calls from the client. `uploadUrl`
 * hands back somewhere to put the bytes; the browser posts them straight to
 * Convex storage and gets a storage id; `check` claims that id for this
 * account, sends the picture to the classifier, and either marks it ready or
 * deletes it. Only then may `messages.send` name it.
 *
 * It is three rather than one because the middle step is the browser
 * talking to storage directly — the bytes never pass through a function,
 * which is what keeps a six-megabyte upload from being a six-megabyte
 * argument — and because the last step is an action rather than a mutation.
 * A mutation cannot make a network request, and the classifier is one. So
 * `check` runs as an action and does its two pieces of database work through
 * the two internal mutations below it, `claim` and `settle`, each of which is
 * a transaction of its own.
 *
 * ## Nothing here trusts the client about the picture
 *
 * The client says which storage id it wants checked, and how wide and tall
 * the picture is. The id is verified against the storage table — the type
 * and size come from there, not from the request — and it is refused if any
 * row already holds it, so an id belonging to somebody else's upload cannot
 * be claimed. The dimensions are bounded and used only to draw a box.
 *
 * Everything else — who is asking, whether they may speak, whether they have
 * too much in flight already — is read from the account, exactly as a send
 * reads it. A picture is a message that happens to be pixels, and it is
 * refused under every rule a message is refused under, before the classifier
 * ever costs a request.
 */

export type UploadResult =
  { ok: true; url: string } | { ok: false; refusal: Refusal };

export type CheckResult =
  | { ok: true; attachmentId: Id<"attachments"> }
  | { ok: false; refusal: Refusal };

type UploadPurpose = "message" | "avatar";

/**
 * Whether this account may put a picture in right now, and if not why.
 *
 * The same bars a send has, minus the ones that need a conversation — a
 * picture is uploaded before anybody knows where it is going. Checked twice,
 * at `uploadUrl` and again at `claim`, because an upload URL is a thing a
 * client can hold on to and the account state can change in between.
 */
async function maySend(
  ctx: MutationCtx,
): Promise<
  { ok: true; profile: Doc<"chatProfiles"> } | { ok: false; refusal: Refusal }
> {
  // The switch, before anything is read. Off means the button is not on
  // screen, so a call here is a client that was asked to make one.
  if (!imagesEnabled()) return { ok: false, refusal: "image" };

  const profile = await callerProfile(ctx);
  if (profile === null) return { ok: false, refusal: "not-a-member" };

  if (!(await hasAccepted(ctx, profile.clerkId))) {
    return { ok: false, refusal: "not-agreed" };
  }

  // The storage bound. Both unsent states count, and `take` on each keeps the
  // read at the cap rather than at however many an account has managed.
  let unsent = 0;
  for (const status of ["checking", "ready"] as const) {
    const rows = await ctx.db
      .query("attachments")
      .withIndex("byOwner", (q) =>
        q.eq("ownerClerkId", profile.clerkId).eq("status", status),
      )
      .take(MAX_UNSENT_IMAGES);
    unsent += rows.length;
  }
  if (unsent >= MAX_UNSENT_IMAGES) {
    return { ok: false, refusal: "too-many-images" };
  }

  return { ok: true, profile };
}

/**
 * Somewhere to put the bytes.
 *
 * The URL is short-lived and single-use on Convex's side, and it grants
 * nothing but the upload: what lands is a file with an id and no owner, which
 * is worth nothing to anybody until `check` below claims it. That is why this
 * can be handed out before the picture has been seen.
 */
export const uploadUrl = mutation({
  args: {
    purpose: v.optional(v.union(v.literal("message"), v.literal("avatar"))),
  },
  handler: async (ctx): Promise<UploadResult> => {
    const allowed = await maySend(ctx);
    if (!allowed.ok) return allowed;
    return { ok: true, url: await ctx.storage.generateUploadUrl() };
  },
});

/**
 * Claim an uploaded file and find out whether it may be shown.
 *
 * The action is the only piece here that talks to the outside, and it holds
 * no state of its own: `claim` writes the row before the request goes out
 * and `settle` writes the verdict after it comes back, so a crash in between
 * leaves a `checking` row and a file, both of which the sweep reclaims.
 *
 * The client waits on this. A picture is checked before it is ever placed
 * in the composer as sendable, which is the whole point — a refusal arrives
 * while the picture is still a thumbnail beside the text box, not after it
 * has been sent to forty people.
 */
export const check = action({
  args: {
    storageId: v.id("_storage"),
    width: v.number(),
    height: v.number(),
    purpose: v.optional(v.union(v.literal("message"), v.literal("avatar"))),
  },
  handler: async (
    ctx,
    { storageId, width, height, purpose },
  ): Promise<CheckResult> => {
    const claimed = await ctx.runMutation(internal.chat.attachments.claim, {
      storageId,
      width,
      height,
      purpose,
    });
    if (!claimed.ok) return claimed;

    const verdict = await inspectImage(claimed.url);

    return await ctx.runMutation(internal.chat.attachments.settle, {
      attachmentId: claimed.attachmentId,
      verdict,
    });
  },
});

type ClaimResult =
  | { ok: true; attachmentId: Id<"attachments">; url: string }
  | { ok: false; refusal: Refusal };

/**
 * Attach an uploaded file to this account, if it is a picture and if the
 * account may send one.
 *
 * The order of the checks is the order of what they cost. An id another row
 * already holds is refused first and untouched — it is somebody else's. After
 * that every refusal deletes the file, because a file this account uploaded
 * and may not use is a file nothing will ever reference, and leaving it for
 * the sweep is an hour of storage for no reason.
 */
export const claim = internalMutation({
  args: {
    storageId: v.id("_storage"),
    width: v.number(),
    height: v.number(),
    purpose: v.optional(v.union(v.literal("message"), v.literal("avatar"))),
  },
  handler: async (
    ctx,
    { storageId, width, height, purpose },
  ): Promise<ClaimResult> => {
    const taken = await ctx.db
      .query("attachments")
      .withIndex("byStorage", (q) => q.eq("storageId", storageId))
      .unique();
    if (taken !== null) return { ok: false, refusal: "image" };

    const file = await ctx.db.system.get("_storage", storageId);
    if (file === null) return { ok: false, refusal: "image" };

    const allowed = await maySend(ctx);
    if (!allowed.ok) {
      await ctx.storage.delete(storageId);
      return allowed;
    }

    const contentType = file.contentType ?? "";
    const isImage = (IMAGE_TYPES as readonly string[]).includes(contentType);
    const sane =
      Number.isInteger(width) &&
      Number.isInteger(height) &&
      width > 0 &&
      height > 0 &&
      width <= MAX_IMAGE_EDGE &&
      height <= MAX_IMAGE_EDGE;

    if (!isImage || file.size > MAX_IMAGE_BYTES || !sane) {
      await ctx.storage.delete(storageId);
      return { ok: false, refusal: "image" };
    }

    const attachmentId = await ctx.db.insert("attachments", {
      storageId,
      ownerClerkId: allowed.profile.clerkId,
      status: "checking",
      purpose: (purpose ?? "message") satisfies UploadPurpose,
      contentType,
      size: file.size,
      width,
      height,
    });

    const url = await ctx.storage.getUrl(storageId);
    if (url === null) {
      // The file was there a moment ago. Not reachable in practice, and
      // handled so that a picture with no URL is a refusal rather than a
      // request to the classifier for nothing.
      await ctx.db.delete(attachmentId);
      await ctx.storage.delete(storageId);
      return { ok: false, refusal: "image" };
    }

    return { ok: true, attachmentId, url };
  },
});

/**
 * Record what the classifier said.
 *
 * A pass is one patch. A refusal is the file and the row gone. Nothing about a
 * rejected picture is persisted after that, which is the same rule as rejected
 * message text.
 */
export const settle = internalMutation({
  args: {
    attachmentId: v.id("attachments"),
    verdict: v.union(
      v.object({ ok: v.literal(true) }),
      v.object({
        ok: v.literal(false),
        refusal: v.union(
          v.literal("sexual"),
          v.literal("exploitation"),
          v.literal("self-harm"),
          v.literal("graphic"),
          v.literal("image-check"),
        ),
      }),
    ),
  },
  handler: async (ctx, { attachmentId, verdict }): Promise<CheckResult> => {
    const row = await ctx.db.get(attachmentId);
    // Swept, or discarded by its owner while the check was out. Either way
    // there is nothing to mark, and the file has already gone with it.
    if (row === null) return { ok: false, refusal: "image" };

    if (verdict.ok) {
      await ctx.db.patch(attachmentId, { status: "ready" });
      return { ok: true, attachmentId };
    }

    await deleteAttachment(ctx, row);
    return { ok: false, refusal: verdict.refusal };
  },
});

/**
 * Take a picture back out of the composer.
 *
 * Only your own, and only one that has not been sent — a sent picture is
 * the message's, and taking it back is `messages.remove`. The file goes now
 * rather than in an hour, because the person pressing the little cross has
 * said they do not want it and there is no reason to keep paying for it.
 */
export const discard = mutation({
  args: { attachmentId: v.id("attachments") },
  handler: async (ctx, { attachmentId }) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;

    const row = await ctx.db.get(attachmentId);
    if (row === null) return;
    if (row.ownerClerkId !== profile.clerkId) return;
    if (row.status === "sent" || row.status === "avatar") return;

    await deleteAttachment(ctx, row);
  },
});

/**
 * What the classifier says about a picture already in storage, in full.
 *
 * The image half of `convex/moderation/inspect.ts`: a way to ask the real
 * model the real question and see every number it answered with, rather
 * than only the verdict `inspectImage` made of them. Internal, so it has no
 * caller but a terminal:
 *
 *   npx convex run chat/attachments:scores '{"storageId": "kg2..."}'
 *
 * Nothing is decided or written. The storage id is on the `attachments`
 * row, or in `images` on the message — `npx convex data attachments`.
 */
export const scores = internalAction({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const url = await ctx.storage.getUrl(storageId);
    if (url === null) return { url: null, result: null };
    return { url, result: await moderate(url) };
  },
});

/** How many files one pass will look at. Storage deletes are the slow part. */
const BATCH = 100;

/**
 * Reclaim every file nothing is holding.
 *
 * Walks the storage table itself, oldest first, and not the `attachments`
 * table — because the files worth finding are exactly the ones that table
 * may not know about. An upload the tab closed on before `claim` ran has no
 * row. An action that died between `claim` and `settle` has a `checking`
 * row. A picture that passed and was never sent has a `ready` row. All three
 * are the same file from storage's point of view: older than `IMAGE_TTL_MS`,
 * and not on any message. A `sent` row is the one thing that keeps a file;
 * everything else past the cutoff goes, row and all.
 *
 * It stops at the first file younger than the cutoff, because the table is
 * in creation order and everything after that is younger still. So the cost
 * of a pass is the number of old orphans plus one, not the number of files.
 *
 * ## This assumes every file in storage is a chat picture
 *
 * Today that is true: nothing else in this deployment writes to storage. If
 * something else ever does, its files need a row here in `sent` or an
 * exemption in this loop, or they will be deleted an hour after they land.
 * That is a sharper edge than most of the sweeps in `convex/chat/sweep.ts`
 * have, and it is written here so it is found before it is felt.
 */
export const sweep = internalMutation({
  args: { cursor: v.optional(v.string()), cutoff: v.optional(v.number()) },
  handler: async (ctx, { cursor, cutoff }) => {
    const before = cutoff ?? Date.now() - IMAGE_TTL_MS;

    const page = await ctx.db.system
      .query("_storage")
      .paginate({ numItems: BATCH, cursor: cursor ?? null });

    let removed = 0;
    let reachedYoung = false;

    for (const file of page.page) {
      if (file._creationTime >= before) {
        reachedYoung = true;
        break;
      }

      const row = await ctx.db
        .query("attachments")
        .withIndex("byStorage", (q) => q.eq("storageId", file._id))
        .unique();

      if (row !== null && row.status === "sent") continue;
      if (row !== null && row.status === "avatar") {
        const owner = await profileFor(ctx, row.ownerClerkId);
        if (owner?.avatarAttachmentId === row._id) continue;
      }

      if (row !== null) await deleteAttachment(ctx, row);
      else await ctx.storage.delete(file._id);
      removed += 1;
    }

    const done = reachedYoung || page.isDone;
    if (!done) {
      await ctx.scheduler.runAfter(0, internal.chat.attachments.sweep, {
        cursor: page.continueCursor,
        cutoff: before,
      });
    }
    return { removed, done };
  },
});
