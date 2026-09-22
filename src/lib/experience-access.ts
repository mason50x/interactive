import "server-only";
import { createExperienceAccess } from "../../experience/src/access.js";

export function experienceAccessFor(clerkId: string) {
  return createExperienceAccess(clerkId, process.env.EXPERIENCE_ACCESS_SECRET);
}
