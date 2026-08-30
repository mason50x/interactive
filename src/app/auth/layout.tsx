import type { Metadata } from "next";
import Link from "next/link";
import { AppProviders } from "@/components/app-providers";
import { AuthAside } from "@/components/auth/auth-aside";
import { Wordmark } from "@/components/wordmark";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  // Every page under /auth resolves to a form or a redirect. Nothing here is
  // worth a search result, and robots.ts disallows the prefix to match.
  robots: { index: false, follow: false },
};

/**
 * The auth shell: information on the left, form on the right, and none of the
 * site chrome. Sitting outside the `(site)` route group is what buys that —
 * the header and footer belong to that group's layout, not to the root.
 *
 * Nothing here constrains the form's width, and no `overflow` is set on the
 * column: Clerk's card sizes itself, and its "last used" badge hangs outside
 * its own bounds, so a scroll container here would clip it.
 */
export default function AuthLayout({ children }: LayoutProps<"/auth">) {
  return (
    <AppProviders>
      <div className="grid min-h-screen lg:grid-cols-2">
        <AuthAside />

        <main className="relative flex flex-col px-6 py-8 sm:px-10 lg:px-14 xl:px-20">
          <div className="flex items-center justify-between">
            {/* The aside carries the lockup from `lg` up; below that this is the
                only way back to the site. */}
            <Link
              href="/"
              aria-label={`${brand.name} home`}
              className="rounded-full transition-opacity hover:opacity-70 lg:invisible"
            >
              <Wordmark />
            </Link>
            <div className="flex items-center gap-1">
              <Link
                href="/"
                className="hidden rounded-full px-3 py-2 text-[0.9375rem] text-muted-foreground transition-colors hover:text-foreground sm:block"
              >
                Back to site
              </Link>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center py-12">
            {children}
          </div>

          <p className="text-center text-[0.8125rem] text-faint">
            By continuing you agree to our{" "}
            <Link href="#" className="underline underline-offset-4 hover:text-muted-foreground">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="#" className="underline underline-offset-4 hover:text-muted-foreground">
              Privacy Policy
            </Link>
            .
          </p>
        </main>
      </div>
    </AppProviders>
  );
}
