// Mason Singel's verified production account (users/j579a533vvb3hc4z0psaw8kn018dgjm3).
// Authorization uses Clerk's signed subject, never editable names or metadata.
const ADMIN_CLERK_IDS = new Set(["user_3IhbuJdEMX72wHvrpeidDZP1LY5"]);

export function isChatAdmin(clerkId: string): boolean {
  return ADMIN_CLERK_IDS.has(clerkId);
}
