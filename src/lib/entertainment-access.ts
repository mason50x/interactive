import "server-only";

import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";

/** Use the same server-owned CEO/moderator staff authorization as the app. */
export const canAccessEntertainment = cache(async (): Promise<boolean> => {
  await auth.protect();
  const { getToken } = await auth();
  const token = await getToken({ template: "convex" });
  if (!token) return false;
  // Authorization failures must never fall through to the catalogue or player.
  return await fetchQuery(api.chat.admin.mine, {}, { token });
});
