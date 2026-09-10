"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "@heroicons/react/24/solid";

/**
 * The one control on a legal page, and the reason it is not a `<Link href="/">`.
 *
 * These pages are reached mid-task more often than they are visited: the
 * commonest entry point is the line under the sign-up form. Sending that
 * reader to `/` would answer "back" by discarding the form they were part way
 * through — and for a signed-in reader `/` is not even a page, since the proxy
 * bounces it to the dashboard. So it steps back through history, and only
 * falls back to the site root when there is no history to step through, which
 * is the case for someone who arrived from a search result.
 */
export function BackLink() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        // `history.length` is 1 only in a tab whose first entry is this page.
        // Anything else — the auth footer, the footer of the marketing page —
        // has somewhere to go back to.
        if (window.history.length > 1) router.back();
        else router.push("/");
      }}
      className="group -my-1 -ml-2 flex items-center gap-1.5 rounded-full px-2 py-2.5 text-[0.875rem] text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeftIcon className="size-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
      Back
    </button>
  );
}
