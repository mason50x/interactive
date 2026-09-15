import { auth } from "@clerk/nextjs/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@convex/_generated/api";

/** Keepalive endpoint for tab close/navigation; ownership still comes from Clerk. */
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return new Response(null, { status: 403 });
  }
  const { userId, getToken } = await auth();
  if (!userId) return new Response(null, { status: 401 });
  const body = await request.json().catch(() => null);
  if (typeof body?.sessionId !== "string" || !body.sessionId || body.sessionId.length > 100) {
    return new Response(null, { status: 400 });
  }
  const token = await getToken({ template: "convex" });
  if (!token) return new Response(null, { status: 401 });
  await fetchMutation(api.experience.release, { sessionId: body.sessionId }, { token });
  return new Response(null, { status: 204 });
}
