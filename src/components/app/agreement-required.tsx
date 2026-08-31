"use client";

import { Button } from "@/components/ui/button";
import { PixelFloor } from "@/components/visuals/pixel-floor";
import { requestAgreement } from "@/lib/agreement";

/**
 * What stands where an activity or a chat would be when the terms have not
 * been accepted.
 *
 * The route already refused on the server (`src/lib/agreement-gate.ts`), so
 * this is not a gate — it is the explanation for one, and it is here rather
 * than a redirect to the catalogue because a click that silently lands you
 * somewhere else is a bug as far as the person clicking is concerned.
 *
 * It used to set the terms out in full, and that was one copy of them too
 * many. There is exactly one place to read the clauses and exactly one place
 * to accept them — the card in the rail — and a page that reprints them is a
 * page that will one day disagree with the card about what was agreed to. So
 * what is left is a sentence, a way through, and the pattern.
 *
 * The sentence is the point of the rewrite. "Chat is behind the agreement" is
 * a door with a sign on it; "You're almost in" is the same door said from the
 * side of the person standing at it, which is the honest side — nothing has
 * gone wrong here and nobody is in trouble. The barrier is still in the room:
 * it is what the letters are cut out of. See `.hazard-text` in `globals.css`.
 *
 * The floor is the same one the handle screen stands on, and deliberately in
 * the account's accent rather than in the red above it. Two screens, one
 * threshold, one edge to it.
 */
export function AgreementRequired({ title }: { title: string }) {
  return (
    <div className="relative flex size-full flex-col items-center justify-center overflow-hidden p-6 pb-[16vh]">
      <PixelFloor />

      {/* Which door this is. Said once, for whoever cannot see that they are
          looking at chat — the line below is the same for all of them. */}
      <p className="sr-only">{title} is behind the agreement.</p>

      <h1 className="hazard-text text-display text-center text-[clamp(2.25rem,7vw,3.25rem)]">
        You&rsquo;re almost in
      </h1>

      {/* Opens the card in the rail with the field already focused. The
          acceptance lives in one place — see `AgreementCard` — so there is no
          second form here to keep in step with it. */}
      <Button onClick={requestAgreement} size="lg" className="relative mt-7">
        Open agreement
      </Button>
    </div>
  );
}
