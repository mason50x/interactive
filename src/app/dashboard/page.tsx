import { auth, currentUser } from "@clerk/nextjs/server";
import { CurrentUserCard } from "@/components/app/current-user-card";

export default async function DashboardPage() {
  // The page owns its own guard rather than inheriting one from middleware or
  // from the layout above it: this is the thing holding the data, so this is
  // where the check cannot be routed around. A signed-out visitor is sent to
  // sign-in with a `redirect_url` back to here.
  await auth.protect();

  const user = await currentUser();
  // Greet by first name where Clerk has one; a name is optional on an account
  // created from an invitation, so the plain greeting has to read well too.
  const greeting = user?.firstName ? `Welcome back, ${user.firstName}` : "Welcome back";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 py-12 sm:px-10 lg:py-16">
      <div>
        <p className="label-caps text-faint">Overview</p>
        <h1 className="text-display mt-3 text-[2rem]">{greeting}</h1>
        <p className="mt-3 max-w-prose text-[0.9375rem] leading-relaxed text-muted-foreground">
          Your account is live. Course material, concept maps, and practice
          land here as they are built.
        </p>
      </div>

      <CurrentUserCard />
    </div>
  );
}
