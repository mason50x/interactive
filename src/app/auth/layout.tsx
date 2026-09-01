import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/solid";
import { RailConstellation } from "@/components/app/rail-constellation";
import { AppProviders } from "@/components/app-providers";

export const metadata: Metadata = {
  // Every page under /auth resolves to a form or a redirect. Nothing here is
  // worth a search result, and robots.ts disallows the prefix to match.
  robots: { index: false, follow: false },
};

/**
 * The auth shell: one centred column, and none of the site chrome. Sitting
 * outside the `(site)` route group is what buys that — the header and footer
 * belong to that group's layout, not to the root.
 *
 * There is no split screen, no marketing panel and no lockup. Clerk's card
 * already names the product at the top of itself; anything above it was the
 * same word twice. What is left is the form, the field behind it, and the way
 * out at the foot.
 *
 * `isolate` is for `RailConstellation`, which draws at `-z-10`: without a
 * stacking context here that layer would fall behind the page background and
 * never be seen. The constellation is a *child of this element* rather than a
 * floating layer, and that is load-bearing — it listens for `pointermove` on
 * its own parent, so only a node the whole page sits inside gets the cursor.
 *
 * The height is `dvh` rather than `vh`. On a phone `100vh` is the viewport
 * with the browser's address bar retracted, which is taller than what you can
 * actually see when the page loads — so a form centred in it starts slightly
 * low and the footer sits below the fold for no reason.
 *
 * Nothing here constrains the form's width, and no `overflow` is set: Clerk's
 * card sizes itself, and its "last used" badge hangs outside its own bounds,
 * so a scroll container would clip it.
 */
export default function AuthLayout({ children }: LayoutProps<"/auth">) {
  return (
    <AppProviders>
      <div className="relative isolate flex min-h-dvh flex-col overflow-hidden px-4 py-6 sm:px-10 sm:py-8">
        {/* Thinner and quieter than the rail's. That field is read through
            seven backdrop blurs down a 15rem column; this one is the entire
            background of a page whose only job is a form, and at the rail's
            weight it competes with the thing you came here to fill in. */}
        <RailConstellation
          areaPerPoint={13000}
          maxPoints={64}
          className="[--web-fade:0.4] dark:[--web-fade:0.34]"
        />

        <main className="flex flex-1 items-center justify-center py-8 sm:py-12">
          {children}
        </main>

        <footer className="relative flex flex-col items-center gap-4">
          <Link
            href="/"
            className="group flex items-center gap-1.5 rounded-full px-3 py-2.5 text-[0.875rem] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
            Back to site
          </Link>

          {/* `py-1.5` on the links, negated on the line, so each is a
              thumb-sized target on a phone without opening the leading. */}
          <p className="text-center text-[0.8125rem] leading-relaxed text-balance text-faint">
            By continuing you agree to our{" "}
            <Link
              href="/tos"
              className="-my-1.5 inline-block py-1.5 underline underline-offset-4 transition-colors hover:text-muted-foreground"
            >
              Terms
            </Link>{" "}
            and{" "}
            <Link
              href="/pp"
              className="-my-1.5 inline-block py-1.5 underline underline-offset-4 transition-colors hover:text-muted-foreground"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </footer>
      </div>
    </AppProviders>
  );
}
