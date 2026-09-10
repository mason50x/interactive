/** Deployment-owned subjects only; display names and public env never grant access. */
export function isChatAdmin(clerkId: string): boolean {
  return containsSubject(process.env.CHAT_ADMIN_CLERK_IDS, clerkId);
}

/** Cosmetic browser badge only. Authorization always uses the Convex setting. */
export function hasChatAdminBadge(clerkId: string): boolean {
  return containsSubject(process.env.NEXT_PUBLIC_CHAT_ADMIN_CLERK_IDS, clerkId);
}

function containsSubject(
  configured: string | undefined,
  clerkId: string,
): boolean {
  return (
    Boolean(clerkId) &&
    (configured ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .includes(clerkId)
  );
}
