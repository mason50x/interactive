"use client";

import { Component, useState, type ReactNode } from "react";
import { useClerk } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import { ConvexError } from "convex/values";

import { api } from "@convex/_generated/api";
import { ANNOUNCEMENT_ERROR } from "@convex/announcementState";
import { AnnouncementCard } from "@/components/app/announcement/announcement-card";
import {
  AnnouncementScreen,
  type LiveAnnouncement,
} from "@/components/app/announcement/announcement-screen";

/**
 * Swallows the error every guarded Convex function throws for a locked-out
 * account. A query further down can hear the refusal a beat before the gate's
 * own subscription does; without this, that beat is a crashed page instead of
 * the screen. Anything else is rethrown to the boundary above.
 */
class LockedOutBoundary extends Component<
  { children: ReactNode },
  { error: unknown }
> {
  state: { error: unknown } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (error instanceof ConvexError && error.data === ANNOUNCEMENT_ERROR)
      return null;
    throw error;
  }
}

/** Top and centre, over everything, and not inside a pane of the app. */
function FloatingAnnouncement({
  announcement,
  onDismiss,
}: {
  announcement: LiveAnnouncement;
  onDismiss: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[95] flex justify-center px-4 [[data-pane]_&]:hidden">
      <div className="pointer-events-auto w-full max-w-md animate-in duration-300 fade-in-0 slide-in-from-top-4">
        <AnnouncementCard announcement={announcement} onDismiss={onDismiss} />
      </div>
    </div>
  );
}

/**
 * Shows the live announcement, whichever form it takes. A full-screen one
 * replaces the whole tree for a member — the providers included, so nothing
 * underneath is left subscribing to functions that now refuse it. The server
 * is what actually holds them out (see `convex/functions.ts`); this only
 * shows them which way. A banner, or a full-screen one seen by the CEO or
 * Head Moderator it exempts, floats a card over the app instead.
 */
export function AnnouncementGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useClerk();
  // Plain `useQuery`, not `useAuthedQuery`: subscribed from the first render
  // (it answers `null` signed out), so when the session reaches Convex it is
  // re-run in the same batch as every other early subscription — notably
  // `preferences.mine` — instead of a beat after them. Subscribing late let
  // those hear the refusal first.
  const latest = useQuery(api.announcement.mine);
  // Hold the last answer through a session re-check, as `TimeoutGate` does,
  // so the screen doesn't drop out for a moment on returning to the tab.
  const [settled, setSettled] = useState(latest);
  if (latest !== undefined && latest !== settled) setSettled(latest);
  const signedOut = !isLoading && !isAuthenticated;
  const announcement = signedOut ? null : (latest ?? settled);
  // Dismissal is per version: an edit, or turning it off and on again,
  // brings the card back. A reload does too, which is what a notice wants.
  const [dismissed, setDismissed] = useState<number | null>(null);

  if (
    announcement &&
    announcement.display === "screen" &&
    !announcement.manages
  )
    return (
      <AnnouncementScreen
        announcement={announcement}
        onSignOut={() => void signOut({ redirectUrl: "/" })}
      />
    );
  return (
    <LockedOutBoundary>
      {children}
      {announcement && dismissed !== announcement.updatedAt && (
        <FloatingAnnouncement
          announcement={announcement}
          onDismiss={() => setDismissed(announcement.updatedAt)}
        />
      )}
    </LockedOutBoundary>
  );
}
