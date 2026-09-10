"use client";

import { useClerk } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { syncChatAccount } from "@/lib/account-actions";

/** A loading state, never a separate signup or consent step. */
export function HandleGate() {
  const { openUserProfile } = useClerk();
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void syncChatAccount().catch(() => {
      if (active) setError(true);
    });
    return () => {
      active = false;
    };
  }, [attempt]);

  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
      {error ? (
        <>
          <p role="alert">Could not open chat. Please try again.</p>
          <Button
            onClick={() => {
              setError(false);
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </Button>
          <Button variant="ghost" onClick={() => openUserProfile()}>
            Manage account
          </Button>
        </>
      ) : (
        <>
          <Spinner />
          <p role="status" className="text-sm text-muted-foreground">
            Opening chat…
          </p>
        </>
      )}
    </div>
  );
}
