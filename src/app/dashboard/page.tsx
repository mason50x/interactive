import { CurrentUserCard } from "./current-user-card";

export default function DashboardPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-foreground/55">
          This route is protected in <code className="font-mono">src/proxy.ts</code>.
          The record below is read live from Convex.
        </p>
      </div>
      <CurrentUserCard />
    </div>
  );
}
