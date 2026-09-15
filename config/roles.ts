/** Site-wide roles. Group owners/admins remain scoped to their conversation. */
export const ROLES = {
  member: {
    deleteChatMessages: false,
    manageVoting: false,
    adminBadge: false,
    botTagsPerDay: 5,
    experienceSecondsPerDay: 30 * 60,
  },
  admin: {
    deleteChatMessages: true,
    manageVoting: true,
    adminBadge: true,
    botTagsPerDay: 50,
    experienceSecondsPerDay: 2 * 60 * 60,
  },
} as const;

/** Add a Clerk subject to ADMIN_CLERK_IDS on Convex to grant every admin privilege.
 * Server only: never authorize from a display name, metadata, or a browser flag.
 */
export function adminClerkIds(): string[] {
  return [...new Set((process.env.ADMIN_CLERK_IDS ?? "")
    .split(",").map(id => id.trim()).filter(Boolean))];
}

export function roleFor(clerkId: string): keyof typeof ROLES {
  return clerkId && adminClerkIds().includes(clerkId) ? "admin" : "member";
}

export function privilegesFor(clerkId: string) {
  return ROLES[roleFor(clerkId)];
}
