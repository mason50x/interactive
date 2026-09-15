/** Site-wide roles; group membership remains scoped to its conversation. */
const staffPrivileges = {
  deleteChatMessages: true,
  manageVoting: true,
  adminBadge: true,
  botTagsPerDay: 50,
  experienceSecondsPerDay: 2 * 60 * 60,
} as const;

export const ROLES = {
  member: {
    deleteChatMessages: false,
    manageVoting: false,
    adminBadge: false,
    botTagsPerDay: 5,
    experienceSecondsPerDay: 30 * 60,
  },
  moderator: { ...staffPrivileges },
  ceo: { ...staffPrivileges },
} as const;

export type StaffRole = "ceo" | "moderator";

/** One server-owned map of exact Clerk IDs to roles. Invalid config grants nothing.
 * STAFF_ROLES={"user_mason":"ceo","user_levin":"moderator"}
 */
export function staffRoles(): { clerkId: string; role: StaffRole }[] {
  try {
    const value: unknown = JSON.parse(process.env.STAFF_ROLES ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    return Object.entries(value).flatMap(([clerkId, role]) =>
      clerkId && (role === "ceo" || role === "moderator")
        ? [{ clerkId, role }]
        : [],
    );
  } catch {
    return [];
  }
}

export function adminClerkIds(): string[] {
  return staffRoles().map(({ clerkId }) => clerkId);
}

export function roleFor(clerkId: string): keyof typeof ROLES {
  return (
    staffRoles().find((entry) => entry.clerkId === clerkId)?.role ?? "member"
  );
}

export function privilegesFor(clerkId: string) {
  return ROLES[roleFor(clerkId)];
}
