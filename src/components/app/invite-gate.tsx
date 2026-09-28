"use client";

import { useClerk } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { useState } from "react";

import { api } from "@convex/_generated/api";
import { RailConstellation } from "@/components/app/rail-constellation";
import { LogoMark } from "@/components/wordmark";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";

/**
 * Covers the app until the account redeems an invite code. The code submits
 * itself on the sixth digit; the gate lifts when `users.current` reports the
 * account invited, so there is no local "done" state to drift from it.
 */
export function InviteGate() {
  const redeem = useMutation(api.invites.redeem);
  const { signOut } = useClerk();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(value: string) {
    setPending(true);
    setError(null);
    try {
      const result = await redeem({ code: value });
      if (!result.ok) {
        setError(result.message);
        setCode("");
      }
    } catch (caught) {
      setError(
        caught instanceof ConvexError && typeof caught.data === "string"
          ? caught.data
          : "Something went wrong. Try again.",
      );
      setCode("");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 isolate z-[100] flex items-center justify-center overflow-y-auto bg-background px-4 py-12 text-foreground">
      {/* The auth screens' web, rising from the bottom edge and gone well
          before the form, so it frames the page without crossing the code.
          The mask is on a wrapper and not the canvas; nothing here blurs
          what is behind it, so the extra layer costs nothing to read. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_top,black,transparent_70%)]"
      >
        <RailConstellation
          areaPerPoint={13000}
          maxPoints={64}
          className="[--web-fade:0.32] dark:[--web-fade:0.28]"
        />
      </div>
      <form
        className="flex w-full max-w-sm flex-col items-center text-center"
        onSubmit={(event) => {
          event.preventDefault();
          if (code.length === 6 && !pending) void submit(code);
        }}
      >
        <LogoMark className="size-10 text-primary" />
        <h1 className="mt-6 text-2xl font-semibold">Enter your invite code</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Rift is invite-only for now. Ask a friend who&apos;s already in for a
          code.
        </p>
        <InputOTP
          maxLength={6}
          pattern={REGEXP_ONLY_DIGITS}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          aria-label="Invite code"
          aria-invalid={error !== null}
          aria-describedby={error ? "invite-error" : undefined}
          disabled={pending}
          value={code}
          onChange={(value) => {
            setCode(value);
            if (error) setError(null);
          }}
          onComplete={(value: string) => void submit(value)}
          containerClassName="mt-8"
        >
          <InputOTPGroup>
            {[0, 1, 2].map((index) => (
              <InputOTPSlot
                key={index}
                index={index}
                aria-invalid={error !== null}
              />
            ))}
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            {[3, 4, 5].map((index) => (
              <InputOTPSlot
                key={index}
                index={index}
                aria-invalid={error !== null}
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
        <p
          id="invite-error"
          role="alert"
          className="mt-3 min-h-5 text-sm text-destructive"
        >
          {error}
        </p>
        <Button
          type="submit"
          className="mt-4 w-full"
          disabled={code.length !== 6 || pending}
        >
          {pending ? "Checking…" : "Continue"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="mt-2 w-full"
          onClick={() => void signOut({ redirectUrl: "/" })}
        >
          Sign out
        </Button>
      </form>
    </div>
  );
}
