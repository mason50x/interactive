"use client";

import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { claimError, handleShapeError } from "@/lib/chat";
import { api } from "../../../../convex/_generated/api";

/**
 * The one screen everybody sees before they can say anything.
 *
 * It exists because the account has a real first name on it and chat must never
 * use one. Asking for a handle is the cost of that, and it is deliberately the
 * whole of the setup — no display name, no picture, no bio. Every field a
 * profile does not have is a field nobody can be identified by.
 *
 * The shape is checked here so the field can object before a round trip. Every
 * other check — reserved names, whether it reads as something unpleasant,
 * whether somebody already has one close enough to it — happens on the server,
 * and none of the rules behind those checks are in this bundle. See
 * `src/lib/chat.ts`.
 */
export function HandleGate() {
  const claim = useMutation(api.chat.profiles.claimHandle);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shape = handle === "" ? null : handleShapeError(handle);
  const ready = handle !== "" && shape === null && !busy;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;

    setBusy(true);
    setError(null);
    const result = await claim({ handle });
    setBusy(false);

    // On success nothing here navigates. The profile query is a subscription,
    // so the row landing is what swaps this screen for the chat — the same way
    // the agreement card gets out of its own way.
    if (!result.ok) setError(claimError(result.reason));
  }

  return (
    <div className="flex size-full items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-display text-[1.75rem]">Pick a handle</h1>

        <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted-foreground">
          This is the only name anyone in chat will see. Your real name and your
          email stay out of it entirely, and you may change this twice
          afterwards and never again — so pick one you would be happy to be
          called by strangers.
        </p>

        <form onSubmit={submit} className="mt-6">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 focus-within:border-primary">
            <span className="text-[0.9375rem] text-faint">@</span>
            <input
              value={handle}
              onChange={(event) => {
                setHandle(event.target.value.toLowerCase());
                setError(null);
              }}
              autoFocus
              maxLength={20}
              spellCheck={false}
              autoComplete="off"
              aria-label="Handle"
              placeholder="something"
              className="h-11 flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-faint"
            />
          </div>

          {/* One message at a time, and the local one goes first: complaining
              that a handle is taken while it is also too short is two problems
              to fix in an order nobody was told. */}
          <p className="mt-2 min-h-5 text-[0.8125rem] text-destructive">
            {shape ?? error ?? ""}
          </p>

          <Button type="submit" disabled={!ready} className="mt-2 w-full">
            {busy ? "Claiming…" : "Claim it"}
          </Button>
        </form>
      </div>
    </div>
  );
}
