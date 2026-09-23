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
 * No padding, on purpose. The 12px ring around a framed activity is drawn by
 * `ActivityFrame` on the app side, where it can be painted with the activity's
 * own colours (see the ambient layer there); a second ring in here would be a
 * dark band between that one and the bundle, which is exactly what the app's
 * ring exists to get rid of.
 *
 * The player owns a minimal Clerk/Convex boundary to enforce the same live
 * playtime lease when this URL is opened directly. The activity bundle remains
 * isolated on its cross-origin asset host.
 */
export default function LearnLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-[#111418]">
      {children}
    </div>
  );
}
