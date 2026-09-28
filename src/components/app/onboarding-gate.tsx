"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@convex/_generated/api";
import { CenteredSpinner } from "@/components/ui/spinner";
import { InviteGate } from "./invite-gate";
import { OnboardingExperience } from "./onboarding-experience";

/** Covers the app shell until the account is invited and its introduction has finished. */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const latest = useQuery(api.users.current, isAuthenticated ? {} : "skip");
  // The query reads `undefined` again whenever Convex re-checks the session —
  // coming back to the tab, a token refresh — because it is skipped while
  // `isAuthenticated` is briefly false. Dropping to the spinner then would
  // unmount the whole app beneath it and replay the access reveal, so the
  // last real answer holds until the next one lands, as `TimeoutGate` does.
  const [settled, setSettled] = useState(latest);
  if (latest !== undefined && latest !== settled) setSettled(latest);
  const user = latest === undefined ? settled : latest;
  const store = useMutation(api.users.store);

  useEffect(() => {
    if (!isAuthenticated || user !== null) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout>;
    const create = async () => {
      try {
        await store();
      } catch {
        if (active) retry = setTimeout(() => void create(), 1500);
      }
    };
    void create();
    return () => {
      active = false;
      clearTimeout(retry);
    };
  }, [isAuthenticated, store, user]);

  if (user === undefined || user === null) {
    return (
      <div
        className="fixed inset-0 z-[100] bg-background"
        aria-label="Loading your account"
      >
        <CenteredSpinner />
      </div>
    );
  }

  // Absent on rows from before invites, which are already in.
  if (user.invited === false) return <InviteGate />;
  // Rows written before this flag was introduced are already experienced users.
  if (user.onboardingComplete !== false) return children;
  return <OnboardingExperience />;
}
