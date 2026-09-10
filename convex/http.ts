import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { Webhook } from "svix";

const http = httpRouter();

/**
 * Clerk webhook endpoint. Point Clerk at
 *   https://<your-deployment>.convex.site/clerk-users-webhook
 * and set CLERK_WEBHOOK_SECRET in the Convex dashboard.
 */
http.route({
  path: "/clerk-users-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const event = await validateRequest(request);
    if (event === null) {
      return new Response("Invalid webhook signature", { status: 400 });
    }

    switch (event.type) {
      case "user.created":
      case "user.updated": {
        await ctx.runMutation(internal.users.upsertFromClerk, {
          data: event.data,
        });

        // The only moment either system learns an invitation was taken up.
        // Clerk fires no invitation event of its own for the acceptance, and
        // the app never sees the sign-up — the recipient completes it on
        // Clerk's side with the ticket from the email.
        if (event.type === "user.created") {
          const email = primaryEmail(event.data);
          if (email !== undefined) {
            const { accepted } = await ctx.runMutation(
              internal.invites.markAccepted,
              { email, clerkId: event.data.id },
            );
            if (accepted > 0) {
              console.log(`user.created ${event.data.id}: invitation accepted`);
            }
          }
        }
        break;
      }
      case "user.deleted": {
        const clerkId = event.data.id;
        if (clerkId === undefined) {
          // Nothing to key the cascade on; ack so Svix stops retrying.
          console.error("user.deleted webhook arrived without a user id");
          break;
        }
        const { deleted, invites, preferences } = await ctx.runMutation(
          internal.users.deleteFromClerk,
          { clerkId },
        );
        console.log(
          `user.deleted ${clerkId}: cleared ${deleted} user row(s), ` +
            `${invites} invite(s), ${preferences} preference row(s)`,
        );
        break;
      }
      default:
        // Other event types are not handled yet.
        break;
    }

    return new Response(null, { status: 200 });
  }),
});

/**
 * The address Clerk considers primary, which for an invited user is the one
 * the invitation was mailed to — that is what makes it the join key back to
 * the invite row. Falls back to the first address for the shapes where the
 * primary id is absent.
 */
function primaryEmail(data: {
  email_addresses?: { id: string; email_address: string }[];
  primary_email_address_id?: string | null;
}): string | undefined {
  const primary = data.email_addresses?.find(
    (address) => address.id === data.primary_email_address_id,
  );
  return primary?.email_address ?? data.email_addresses?.[0]?.email_address;
}

async function validateRequest(request: Request): Promise<WebhookEvent | null> {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (secret === undefined) {
    throw new Error("CLERK_WEBHOOK_SECRET is not set on the Convex deployment");
  }

  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (id === null || timestamp === null || signature === null) {
    return null;
  }

  const payload = await request.text();
  const headers = {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": signature,
  };

  try {
    return new Webhook(secret).verify(payload, headers) as WebhookEvent;
  } catch (error) {
    console.error("Could not verify Clerk webhook:", error);
    return null;
  }
}

export default http;
