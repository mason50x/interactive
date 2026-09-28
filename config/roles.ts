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

/**
 * Mason Singel's exact Clerk account: the site's founder and original CEO.
 *
 * Bound to the account the way X access is (`config/experience-access.json`),
 * not to a role, so no role edit can move it. Every CEO has the same powers
 * except over each other: only the founder can change another CEO's role,
 * and nobody can change the founder's. See `setRole` in
 * `convex/adminQuotas.ts`.
 */
export const FOUNDER_CLERK_ID = "user_3IhbuJdEMX72wHvrpeidDZP1LY5";

export function isFounder(clerkId: string): boolean {
  return clerkId === FOUNDER_CLERK_ID;
}

/**
 * Why a CEO may not change one account's role, or `null` when they may.
 *
 * The caller must already be a CEO; this only settles the cases CEOs differ
 * on. Shared by `setRole` in `convex/adminQuotas.ts`, which refuses with the
 * message, and by the Admin user directory, which shows it instead of a
 * control the server would refuse.
 */
export function roleChangeRefusal(
  caller: string,
  target: string,
  targetRole: keyof typeof ROLES,
): string | null {
  if (target === caller) return "You cannot change your own role.";
  if (isFounder(target)) return "The founder's role can't be changed.";
  if (targetRole === "ceo" && !isFounder(caller)) {
    return "Only the founder can change another CEO's role.";
  }
  return null;
}

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
