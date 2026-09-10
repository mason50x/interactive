import type { MutationCtx } from "../_generated/server";
import { ensureGlobalMembership, profileFor } from "./shared";

/** Match the requested casing without changing the account's original name. */
export function formatFirstName(name: string): string {
  const letters = Array.from(name.trim().replace(/\s+/gu, " ").normalize("NFC").toLowerCase());
  return letters.length ? letters[0].toUpperCase() + letters.slice(1).join("") : "";
}

/** Prefer the first name, then just enough surname to distinguish this person. */
async function displayNameFor(
  ctx: MutationCtx,
  clerkId: string,
  username: string,
  firstName?: string,
  lastName?: string,
): Promise<string> {
  const first = formatFirstName(firstName ?? "") || username;
  const available = async (name: string) => {
    const matches = await ctx.db.query("chatProfiles")
      .withIndex("byDisplayNameKey", q => q.eq("displayNameKey", name.toLowerCase()))
      .take(2);
    return matches.every(profile => profile.clerkId === clerkId);
  };
  if (await available(first)) return first;
  const surname = Array.from(formatFirstName(lastName ?? ""));
  for (let length = 1; length <= surname.length; length++) {
    const candidate = `${first} ${surname.slice(0, length).join("")}`.trimEnd();
    if (await available(candidate)) return candidate;
  }
  // Identical full names (or no surname) are distinguished by the unique handle.
  const fallback = `${first} (@${username})`;
  for (let suffix = 1; suffix <= 100; suffix++) {
    const candidate = suffix === 1 ? fallback : `${fallback} ${suffix}`;
    if (await available(candidate)) return candidate;
  }
  throw new Error("Could not allocate a distinct display name");
}

/** Keep identity in place: references, moderation history and memberships survive. */
export async function syncAccountProfile(
  ctx: MutationCtx,
  clerkId: string,
  username: string,
  firstName?: string,
  lastName?: string,
) {
  const profile = await profileFor(ctx, clerkId);
  const displayName = await displayNameFor(ctx, clerkId, username, firstName, lastName);
  const identity = {
    handle: username,
    handleKey: username.toLowerCase(),
    displayName,
    displayNameKey: displayName.toLowerCase(),
  };
  if (profile) {
    await ctx.db.patch(profile._id, {
      ...identity,
      ...(profile.avatarMode === undefined ? {
        avatarMode: "account" as const,
        avatarAttachmentId: undefined,
        avatarEmoji: undefined,
        avatarInitials: undefined,
      } : {}),
    });
  } else {
    await ctx.db.insert("chatProfiles", {
      clerkId, ...identity, avatarMode: "account", createdAt: Date.now(),
    });
  }
  // Existing and new accounts enter Everyone automatically, including after leaving.
  await ensureGlobalMembership(ctx, clerkId);
}
