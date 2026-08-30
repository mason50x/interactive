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
      case "user.updated":
        await ctx.runMutation(internal.users.upsertFromClerk, {
          data: event.data,
        });
        break;
      case "user.deleted": {
        const clerkId = event.data.id;
        if (clerkId !== undefined) {
          await ctx.runMutation(internal.users.deleteFromClerk, { clerkId });
        }
        break;
      }
      default:
        // Other event types are not handled yet.
        break;
    }

    return new Response(null, { status: 200 });
  }),
});

async function validateRequest(request: Request): Promise<WebhookEvent | null> {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (secret === undefined) {
    throw new Error("CLERK_WEBHOOK_SECRET is not set on the Convex deployment");
  }

  const payload = await request.text();
  const headers = {
    "svix-id": request.headers.get("svix-id")!,
    "svix-timestamp": request.headers.get("svix-timestamp")!,
    "svix-signature": request.headers.get("svix-signature")!,
  };

  try {
    return new Webhook(secret).verify(payload, headers) as WebhookEvent;
  } catch (error) {
    console.error("Could not verify Clerk webhook:", error);
    return null;
  }
}

export default http;
