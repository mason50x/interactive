"use client";

import { Dialog } from "@base-ui/react/dialog";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAgreement } from "@/components/app/agreement-provider";
import { Button } from "@/components/ui/button";
import {
  AGREEMENT_CLAUSES,
  AGREEMENT_PHRASE,
  matchesAgreementPhrase,
  onAgreementRequest,
} from "@/lib/agreement";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

const HOLD_MS = 1500;

type Phase = "asking" | "done";

export function HeaderAgreement() {
  const agreement = useAgreement();
  const accept = useMutation(api.agreement.accept);

  const [phase, setPhase] = useState<Phase>("asking");
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const asking = phase === "asking";
  const accepted = !asking || (agreement?.agreed ?? false);
  const superseded = agreement?.superseded ?? false;
  const matches = matchesAgreementPhrase(typed);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  // Listen to requestAgreement() from locked activities
  useEffect(
    () =>
      onAgreementRequest(() => {
        setError(null);
        setOpen(true);
      }),
    [],
  );

  useEffect(() => {
    if (open && asking) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open, asking]);

  useEffect(() => {
    if (phase !== "done") return;
    const timer = setTimeout(() => {
      setOpen(false);
    }, HOLD_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !matches) return;

    setError(null);
    setSaving(true);
    try {
      const result = await accept({ typed });
      if (result.ok) {
        setTyped("");
        setPhase("done");
      } else if (result.reason === "phrase") {
        setError(`Type "${AGREEMENT_PHRASE}" exactly.`);
      } else {
        setError("You are not signed in.");
      }
    } catch {
      setError("That did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  // Nothing to draw if not loaded or if already agreed and not in celebration phase
  if (!agreement) return null;
  if (agreement.agreed && asking) return null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else setOpen(true);
      }}
    >
      <Dialog.Trigger
        aria-label={
          accepted ? "Agreement, accepted" : "Agreement, required"
        }
        className={cn(
          "flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[0.875rem] font-medium transition-colors outline-none",
          accepted
            ? "text-primary hover:bg-foreground/[0.05]"
            : "bg-destructive/10 text-destructive hover:bg-destructive/15 focus-visible:ring-2 focus-visible:ring-destructive/60",
        )}
      >
        {accepted ? (
          <CheckCircleIcon className="size-4 shrink-0 text-primary" />
        ) : (
          <ExclamationTriangleIcon className="size-4 shrink-0 text-destructive" />
        )}
        <span className="hidden sm:inline">Agreement</span>
        <span className="text-[0.75rem] opacity-80">
          {accepted ? "Accepted" : superseded ? "Updated" : "Required"}
        </span>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity" />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <Dialog.Popup className="popup-slide relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-popover p-6 text-popover-foreground shadow-2xl shadow-black/20 outline-none">
            <div className="flex items-center justify-between pb-3">
              <div className="flex items-center gap-2">
                {accepted ? (
                  <CheckCircleIcon className="size-5 text-primary" />
                ) : (
                  <ExclamationTriangleIcon className="size-5 text-destructive" />
                )}
                <Dialog.Title className="text-[1.0625rem] font-semibold text-foreground">
                  User Agreement
                </Dialog.Title>
              </div>
              <Dialog.Close
                onClick={close}
                aria-label="Close dialog"
                className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
              >
                <XMarkIcon className="size-4" />
              </Dialog.Close>
            </div>

            {asking ? (
              <>
                <ul className="mt-2 flex flex-col gap-2.5">
                  {AGREEMENT_CLAUSES.map((clause) => (
                    <li
                      key={clause}
                      className="flex gap-2.5 text-[0.8125rem] leading-relaxed text-muted-foreground"
                    >
                      <span
                        aria-hidden
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-border-strong"
                      />
                      <span>{clause}</span>
                    </li>
                  ))}
                </ul>

                <form
                  onSubmit={submit}
                  className="mt-5 border-t border-border pt-4"
                >
                  <p className="text-[0.8125rem] leading-relaxed text-foreground">
                    {superseded
                      ? `The terms have changed. Type "${AGREEMENT_PHRASE}" to accept them again.`
                      : `Type "${AGREEMENT_PHRASE}" to agree. Nothing opens until you do.`}
                  </p>

                  <div className="mt-3 flex gap-2">
                    <input
                      ref={inputRef}
                      type="text"
                      name="agreement"
                      value={typed}
                      onChange={(event) => setTyped(event.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      disabled={saving}
                      placeholder={AGREEMENT_PHRASE}
                      aria-label={`Type ${AGREEMENT_PHRASE} to agree`}
                      className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[0.875rem] transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                    />
                    <Button
                      type="submit"
                      disabled={saving || !matches}
                      className="shadow-none hover:shadow-none"
                    >
                      {saving ? "Saving…" : "Agree"}
                    </Button>
                  </div>

                  {error && (
                    <p
                      role="status"
                      className="mt-2.5 text-[0.8125rem] leading-relaxed text-destructive"
                    >
                      {error}
                    </p>
                  )}
                </form>
              </>
            ) : (
              <div
                role="status"
                className="flex flex-col items-center justify-center py-8"
              >
                <div className="relative flex items-center justify-center">
                  <span
                    aria-hidden
                    className="agree-ring absolute size-14 rounded-full border-2 border-primary"
                  />
                  <CheckCircleIcon className="agree-pop size-14 text-primary" />
                </div>
                <p className="agree-rise mt-3 text-[1.0625rem] font-medium text-foreground">
                  Enjoy!
                </p>
              </div>
            )}
          </Dialog.Popup>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
