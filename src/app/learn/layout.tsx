import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  // An activity exists to be framed by its dashboard page, not to be found. It
  // is behind the session and carries nothing a crawler should index.
  robots: { index: false, follow: false },
};

/**
 * The activity shell: a board on a dark ground and nothing else.
 *
 * What is absent is the point. No `AppProviders`, so this page loads no Clerk
 * script and no Convex client of its own — nothing the framed bundle could
 * borrow. The bundle itself is a cross-origin document on the asset origin
 * (see `HostedActivity`); the browser keeps it away from anything of ours, and
 * this shell keeps the page around it empty so there is nothing to keep it
 * away *from*. An activity that wants to persist a score would say so over
 * `postMessage` and let the app — which does hold the session — decide whether
 * to write it.
 */
export default function LearnLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-[#111418] p-3">
      {children}
    </div>
  );
}
