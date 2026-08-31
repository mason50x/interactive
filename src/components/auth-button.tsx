"use client";

import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * Sign-in and sign-up are route changes, not modals — `/auth/sign-in` and
 * `/auth/sign-up` own the flow. The App Router holds the current page on
 * screen while it fetches the auth route, so between the click and the swap
 * the button looks like it did nothing. These two exports fill that gap.
 *
 * Nothing ever clears the pending state, and that is deliberate: `/auth` sits
 * outside the `(site)` layout, so arriving there unmounts whichever trigger
 * was clicked. A click that lands before Clerk has loaded is queued rather
 * than dropped, so the spinner keeps running until the queue drains instead of
 * lying about being finished.
 */

/** The pending flag on its own, for triggers that are not the `Button` primitive. */
export function useAuthPending() {
  const [pending, setPending] = useState(false);
  return { pending, start: () => setPending(true) };
}

type AuthButtonProps = ComponentProps<typeof Button> & {
  /** Which flow the click opens. */
  mode?: "sign-in" | "sign-up";
};

/**
 * A Clerk trigger wrapped around the `Button` primitive, spinner included.
 * Clerk awaits the child's own `onClick` before running its own, so hooking
 * the click here races with nothing.
 */
export function AuthButton({
  mode = "sign-up",
  className,
  onClick,
  children,
  ...props
}: AuthButtonProps) {
  const { pending, start } = useAuthPending();
  const Trigger = mode === "sign-in" ? SignInButton : SignUpButton;

  return (
    <Trigger>
      <Button
        aria-busy={pending}
        // The marketing sizes carry no gap of their own, so the spinner has to
        // ask for one — and only while it is there, or the label sits off
        // centre for the whole of the button's resting life.
        className={cn(pending && "gap-2", className)}
        onClick={(event) => {
          onClick?.(event);
          start();
        }}
        {...props}
      >
        {pending && <Spinner aria-hidden />}
        {children}
      </Button>
    </Trigger>
  );
}
