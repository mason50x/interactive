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
  co_owner: { ...staffPrivileges },
  ceo: { ...staffPrivileges },
} as const;

export type StaffRole =
  "ceo" | "co_owner" | "head_moderator" | "moderator" | "builder";

/**
 * The roles that open the Admin page and everything behind it. A Head
 * Moderator holds every CEO power except over CEOs themselves, invite codes,
 * and role changes, which stay a CEO's alone. A Co-Owner is a Head Moderator
 * in everything but name: the same powers, with its own badge in chat.
 */
export type AdminRole = "ceo" | "co_owner" | "head_moderator";

export function isAdminRole(role: keyof typeof ROLES): role is AdminRole {
  return role === "ceo" || role === "co_owner" || role === "head_moderator";
}

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
 * Why an admin may not change one account's role, or `null` when they may.
 *
 * The caller must already be an admin; this only settles the cases admins
 * differ on. Shared by `setRole` in `convex/adminQuotas.ts`, which refuses
 * with the message, and by the Admin user directory, which shows it instead
 * of a control the server would refuse.
 *
 * Role changes are a CEO's alone: Head Moderators and Co-Owners cannot change
 * anybody's. CEOs are equals except over each other: only the founder changes
 * a CEO's role.
 */
export function roleChangeRefusal(
  caller: { clerkId: string; role: AdminRole },
  target: string,
  targetRole: keyof typeof ROLES,
): string | null {
  if (caller.role !== "ceo") return "Only a CEO can change roles.";
  if (target === caller.clerkId) return "You cannot change your own role.";
  if (isFounder(target)) return "The founder's role can't be changed.";
  if (targetRole === "ceo" && !isFounder(caller.clerkId)) {
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
        role === "co_owner" ||
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
