import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  // The player origin exists to run untrusted code, not to be found. Every
  // route under it is reached by being framed from the app.
  robots: { index: false, follow: false },
};

/**
 * The player shell: a board on a dark ground and nothing else.
 *
 * What is absent is the point. No `AppProviders`, so no Clerk script and no
 * Clerk cookies on this origin, and no Convex client for activity code to borrow.
 * An activity that wants to persist a score says so over `postMessage` and lets the
 * app — which does hold the session — decide whether to write it.
 */
export default function PlayerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-[#111418] p-3">
      {children}
    </div>
  );
}
