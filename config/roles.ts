import { PLAYTIME_SECONDS } from "./playtime";

/** Site-wide roles; group membership remains scoped to its conversation. */
const staffPrivileges = {
  deleteChatMessages: true,
  adminBadge: true,
  botTagsPerDay: 50,
  experienceSecondsPerDay: PLAYTIME_SECONDS,
} as const;

export const ROLES = {
  member: {
    deleteChatMessages: false,
    adminBadge: false,
    botTagsPerDay: 5,
    experienceSecondsPerDay: PLAYTIME_SECONDS,
  },
  builder: { ...staffPrivileges, deleteChatMessages: false, adminBadge: false },
  moderator: { ...staffPrivileges },
  head_moderator: { ...staffPrivileges },
  ceo: { ...staffPrivileges },
} as const;

export type StaffRole = "ceo" | "head_moderator" | "moderator" | "builder";

/** One server-owned map of exact Clerk IDs to roles. Invalid config grants nothing.
 * STAFF_ROLES={"user_mason":"ceo","user_levin":"moderator"}
 */
export function staffRoles(): { clerkId: string; role: StaffRole }[] {
  try {
    const value: unknown = JSON.parse(process.env.STAFF_ROLES ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    return Object.entries(value).flatMap(([clerkId, role]) =>
      clerkId &&
      (role === "ceo" ||
        role === "head_moderator" ||
        role === "moderator" ||
        role === "builder")
        ? [{ clerkId, role }]
        : [],
    );
  } catch {
    return [];
  }
}

export function adminClerkIds(): string[] {
  return staffRoles()
    .filter(({ role }) => ROLES[role].adminBadge)
    .map(({ clerkId }) => clerkId);
}

export function roleFor(clerkId: string): keyof typeof ROLES {
  return (
    staffRoles().find((entry) => entry.clerkId === clerkId)?.role ?? "member"
  );
}

export function privilegesFor(clerkId: string) {
  return ROLES[roleFor(clerkId)];
}
