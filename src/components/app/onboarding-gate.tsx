"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "@convex/_generated/api";
import { CenteredSpinner } from "@/components/ui/spinner";
import { OnboardingExperience } from "./onboarding-experience";

/** Covers the app shell until the account's introduction has finished. */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.current, isAuthenticated ? {} : "skip");
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

  // Rows written before this flag was introduced are already experienced users.
  if (user.onboardingComplete !== false) return children;
  return <OnboardingExperience />;
}
