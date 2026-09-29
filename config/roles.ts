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
 * The roles that open the Admin page and everything behind it. A Head
 * Moderator holds every CEO power except over CEOs themselves: they cannot
 * act on a CEO's account, and they cannot grant the CEO role.
 */
export type AdminRole = "ceo" | "head_moderator";

export function isAdminRole(role: keyof typeof ROLES): role is AdminRole {
  return role === "ceo" || role === "head_moderator";
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
 * CEOs are equals except over each other, and Head Moderators likewise: a
 * Head Moderator can change any role below their own, while another Head
 * Moderator's, or a CEO's, is a CEO's call. Only the founder changes a CEO's.
 */
export function roleChangeRefusal(
  caller: { clerkId: string; role: AdminRole },
  target: string,
  targetRole: keyof typeof ROLES,
): string | null {
  if (target === caller.clerkId) return "You cannot change your own role.";
  if (isFounder(target)) return "The founder's role can't be changed.";
  if (targetRole === "ceo" && !isFounder(caller.clerkId)) {
    return "Only the founder can change another CEO's role.";
  }
  if (targetRole === "head_moderator" && caller.role !== "ceo") {
    return "Only a CEO can change another Head Moderator's role.";
  }
  return null;
}

/**
 * Why an admin may not hand out one role, or `null` when they may. Granting
 * CEO is a CEO's call; everything below it any admin can give.
 */
export function roleGrantRefusal(
  callerRole: AdminRole,
  role: keyof typeof ROLES,
): string | null {
  if (role === "ceo" && callerRole !== "ceo") {
    return "Only a CEO can grant the CEO role.";
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
