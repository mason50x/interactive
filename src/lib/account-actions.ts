"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference, type FunctionArgs } from "convex/server";
import { fetchAction } from "convex/nextjs";
import { api, internal } from "../../convex/_generated/api";

/** The caller cannot supply a user id or profile fields. Clerk is authoritative. */
export async function syncChatAccount() {
  const { userId, getToken } = await auth();
  if (!userId) throw new Error("Not signed in");
  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  if (!deployKey) {
    // Local Convex development has its own Clerk key and authenticates the same caller.
    const token = await getToken({ template: "convex" });
    if (!token) throw new Error("Missing account token");
    await fetchAction(api.accountSync.mine, {}, { token });
    return;
  }
  const user = await currentUser();
  if (!user || user.id !== userId || !user.username) throw new Error("Account needs a username");
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  // Convex supports admin authentication for trusted server-to-server internal calls.
  (client as ConvexHttpClient & { setAdminAuth(key: string): void }).setAdminAuth(deployKey);
  await client.mutation(makeFunctionReference<"mutation", FunctionArgs<typeof internal.users.upsertFromClerk>>("users:upsertFromClerk"), { data: {
    id: user.id, username: user.username, first_name: user.firstName,
    last_name: user.lastName, image_url: user.imageUrl, updated_at: user.updatedAt,
    primary_email_address_id: user.primaryEmailAddressId,
    email_addresses: user.emailAddresses.map(address => ({ id: address.id, email_address: address.emailAddress })),
  } });
}
