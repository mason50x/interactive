import { Show, SignUpButton } from "@clerk/nextjs";
import Link from "next/link";

const stack = [
  ["Next.js 16", "App Router, React 19, Turbopack"],
  ["Convex", "Reactive database, queries and mutations"],
  ["Clerk", "Hosted auth, synced into the users table"],
  ["Tailwind v4", "Utility styling, no config file"],
];

export default function Home() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-12 px-6 py-20">
      <section className="flex flex-col gap-5">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          The foundation is up.
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-foreground/60">
          Clerk handles sign-in. Every signed-in user is written to the Convex{" "}
          <code className="rounded bg-black/[.05] px-1.5 py-0.5 font-mono text-sm dark:bg-white/[.08]">
            users
          </code>{" "}
          table, and read back from it on the dashboard.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Show when="signed-out">
            <SignUpButton>
              <button className="h-11 cursor-pointer rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-85">
                Create an account
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <Link
              href="/dashboard"
              className="flex h-11 items-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-85"
            >
              Go to dashboard
            </Link>
          </Show>
        </div>
      </section>

      <section className="grid gap-px overflow-hidden rounded-xl border border-black/[.08] bg-black/[.08] sm:grid-cols-2 dark:border-white/[.12] dark:bg-white/[.12]">
        {stack.map(([name, detail]) => (
          <div key={name} className="bg-background p-5">
            <h2 className="font-mono text-sm font-semibold">{name}</h2>
            <p className="mt-1 text-sm text-foreground/55">{detail}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
