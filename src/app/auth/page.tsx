import { redirect } from "next/navigation";

/**
 * `/auth` is a container, not a destination. Anyone who trims the path back to
 * it — or follows a stale link — lands on the sign-in form rather than a 404.
 */
export default function AuthIndexPage() {
  redirect("/auth/sign-in");
}
