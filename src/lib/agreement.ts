/**
 * The terms, the phrase, and the way anything on the page asks for the card.
 *
 * Deliberately free of React and of Convex so that a server component, a
 * client component, and the locked activity page can all read the same words.
 * The acceptance itself lives in `convex/agreement.ts`, which is also where
 * the version of these terms is kept.
 */

/**
 * The state of one account's acceptance, as the server reports it and as the
 * rail and the tiles read it. `null` anywhere this appears means "not known",
 * which is never the same as "has not agreed" — see `AgreementProvider`.
 */
export type Agreement = {
  agreed: boolean;
  /** When the terms currently on file were accepted, if they were. */
  agreedAt: number | null;
  /** Agreed to an older wording, and owes the current one. */
  superseded: boolean;
};

/**
 * What the person types to agree, exactly as it is shown to them.
 *
 * `convex/agreement.ts` holds the normalized copy this is compared against.
 * Two copies, because a Convex function module bundles from `convex/` — the
 * comment there has the rest of it.
 */
export const AGREEMENT_PHRASE = "I understand";

/**
 * The terms. Five short clauses rather than a page of prose, because the whole
 * point of typing the phrase is that the person has read them, and nobody
 * reads a page of prose inside a card in a sidebar.
 *
 * The first is the condition the rest hang off: this is handed over, and it is
 * handed over on terms. The two in the middle are what happens when something
 * goes wrong — a breach or a compromise on one side, an account that has become
 * a problem for us on the other — and both are deliberately short of a promise
 * about the outcome. What they say is that it gets looked at.
 *
 * The fourth is the one that is not hedged, because it is the part somebody
 * would otherwise assume wrongly. Every service they have ever been suspended
 * from let them back; this one does not, and a clause that left that to be
 * discovered later would be the clause doing the least work in the set.
 *
 * The fifth is the exception to all of it, and it says so. Chat is enforced by
 * a program with nobody behind it: it reads what you send, it decides, and
 * there is nothing to appeal to. Claiming a person is involved would be the one
 * false sentence here, and the honest version is also the more frightening one,
 * which is the right way round.
 *
 * Changing any of this is changing the agreement. Bump `AGREEMENT_VERSION` in
 * `convex/agreement.ts` when it happens, or everyone who accepted the old
 * wording stays marked as having accepted the new one.
 */
export const AGREEMENT_CLAUSES: readonly string[] = [
  "We are handing you this on the condition that you use it with caution and stay alert the entire time you are in it.",
  "If we detect a breach, or find that your account has been compromised, your account might be at risk.",
  "If your account is causing trouble for us, we'll look into the account.",
  "Taken down is not suspended. We blacklist you.",
  "Chat is watched by a machine, not a person. It reads everything you send, it decides on its own, and there is nobody to appeal to.",
];

/**
 * The same check the server makes, so the button does not enable on a phrase
 * that is about to be refused. Case and spacing are not what is being tested —
 * `convex/agreement.ts` has the reasoning.
 */
export function matchesAgreementPhrase(typed: string): boolean {
  return (
    typed.trim().replace(/\s+/g, " ").toLowerCase() ===
    AGREEMENT_PHRASE.toLowerCase()
  );
}

/**
 * How anything blocked by the agreement gets the card open.
 *
 * A locked tile and the locked activity page both want to say "agree over
 * there", and neither is anywhere near the rail in the tree — the card is in
 * the layout, the tiles are eighty deep in a page. A window event is the whole
 * coupling: senders need nothing but this module, and the card listens for it
 * and opens itself. No context, no provider, nothing to thread through
 * `ActivityCard`, which renders 318 times and should carry as little as it can.
 */
const REQUEST_EVENT = "50x:agreement-request";

/** Ask the rail's agreement card to open. Safe to call from an event handler
 *  in any client component; nothing happens if the card is not mounted. */
export function requestAgreement() {
  window.dispatchEvent(new Event(REQUEST_EVENT));
}

/** The card's side of it. Returns the unsubscribe, for an effect's cleanup. */
export function onAgreementRequest(handler: () => void) {
  window.addEventListener(REQUEST_EVENT, handler);
  return () => window.removeEventListener(REQUEST_EVENT, handler);
}
