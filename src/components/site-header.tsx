import {
  SignInButton,
  SignUpButton,
  Show,
  UserButton,
} from "@clerk/nextjs";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-black/[.08] bg-background/80 backdrop-blur dark:border-white/[.12]">
      <nav className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-6">
        <Link href="/" className="font-mono text-sm font-semibold tracking-tight">
          50x
        </Link>

        <div className="flex items-center gap-3">
          <Show when="signed-in">
            <Link
              href="/dashboard"
              className="rounded-full px-3 py-1.5 text-sm text-foreground/70 transition-colors hover:bg-black/[.05] hover:text-foreground dark:hover:bg-white/[.08]"
            >
              Dashboard
            </Link>
            <UserButton />
          </Show>

          <Show when="signed-out">
            <SignInButton>
              <button className="cursor-pointer rounded-full px-3 py-1.5 text-sm text-foreground/70 transition-colors hover:bg-black/[.05] hover:text-foreground dark:hover:bg-white/[.08]">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton>
              <button className="h-9 cursor-pointer rounded-full bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-85">
                Sign up
              </button>
            </SignUpButton>
          </Show>
        </div>
      </nav>
    </header>
  );
}
