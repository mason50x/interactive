import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Home" };

/**
 * Home — a placeholder, and deliberately still a route.
 *
 * `/dashboard` used to redirect straight to the catalogue, on the reasoning
 * that the app *was* the games and there was nothing to land on. There is a
 * rail row pointing here now, so a redirect would make one of two tabs
 * impossible to be on. What goes in it is not decided yet; what matters is
 * that the landing place exists, because plenty of things point at the bare
 * URL — the wordmark in the rail, a bookmark, and Clerk's redirect after a
 * sign-in.
 */
export default async function DashboardPage() {
  // The layout guards the shell, but the router does not re-render a shared
  // layout between sibling pages, so every page under /dashboard guards itself.
  await auth.protect();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-12 sm:px-10 lg:py-16">
      <div>
        <p className="label-small text-faint">
          Home
        </p>
        <h1 className="text-display mt-3 text-[2rem]">Welcome back</h1>
        <p className="mt-3 max-w-prose text-[0.9375rem] leading-relaxed text-muted-foreground">
          Nothing lives here yet. Head to Activities to start something, or use
          the search box in the rail to find it by name.
        </p>
      </div>
    </div>
  );
}
