"use client";

import { LockClosedIcon } from "@heroicons/react/24/solid";
import { Button, ButtonLink } from "@/components/ui/button";
import { AGREEMENT_CLAUSES, requestAgreement } from "@/lib/agreement";
import { ACTIVITIES_HREF } from "@/lib/nav";

/**
 * What stands where an activity would be when the terms have not been accepted.
 *
 * The route already refused on the server (`src/lib/agreement-gate.ts`), so
 * this is not a gate — it is the explanation for one, and it is here rather
 * than a redirect to the catalogue because a click that silently lands you
 * somewhere else is a bug as far as the person clicking is concerned.
 *
 * The terms are repeated in full. Sending someone to a card in the rail to
 * read four sentences they could have read here would be making them hunt for
 * the thing that is blocking them; the button is for signing, not for finding
 * out what.
 */
export function AgreementRequired({ title }: { title: string }) {
  return (
    <div className="flex size-full items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 text-destructive">
          <LockClosedIcon className="size-4 shrink-0" />
          <span className="text-[0.875rem] font-medium">Locked</span>
        </div>

        <h1 className="mt-3 text-display text-[1.75rem]">
          {title} is behind the agreement
        </h1>

        <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted-foreground">
          Nothing opens until you accept these. There are four of them:
        </p>

        <ul className="mt-4 flex flex-col gap-2.5">
          {AGREEMENT_CLAUSES.map((clause) => (
            <li
              key={clause}
              className="flex gap-2.5 text-[0.9375rem] leading-relaxed text-muted-foreground"
            >
              <span
                aria-hidden
                className="mt-[0.6rem] size-1 shrink-0 rounded-full bg-border-strong"
              />
              <span>{clause}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex items-center gap-2">
          {/* Opens the card in the rail with the field already focused. The
              acceptance lives in one place — see `AgreementCard` — so there is
              no second form here to keep in step with it. */}
          <Button onClick={requestAgreement} size="lg">
            Read and agree
          </Button>
          <ButtonLink href={ACTIVITIES_HREF} variant="ghost" size="lg">
            Back to activities
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
