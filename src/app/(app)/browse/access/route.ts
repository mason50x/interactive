import { auth } from "@clerk/nextjs/server";
import { experienceAccessFor } from "@/lib/experience-access";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return new Response(null, { status: 403 });
  }
  const { userId } = await auth();
  if (!userId) return new Response(null, { status: 401 });
  const token = await experienceAccessFor(userId);
  if (!token) return new Response(null, { status: 403 });
  return Response.json({ token }, { headers: { "cache-control": "no-store" } });
}
