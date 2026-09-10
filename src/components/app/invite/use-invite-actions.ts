"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { revokeInvite, sendInvite } from "@/lib/invite-actions";

/**
 * How long the receipt holds the panel after a send. Long enough to read two
 * short lines without being asked to, short enough that nobody starts
 * wondering whether the card has got stuck.
 */
const RECEIPT_MS = 4000;

/**
 * The two things the invite card does — send an address, take one back — and
 * what each leaves behind: the field, the last error, the receipt.
 *
 * Both run as transitions so the card stays responsive across the round
 * trip, and both share one `pending`, because the list and the form are one
 * panel and a revoke landing while a send is in flight would be two answers
 * arriving over each other.
 *
 * `reset` is for the card closing: reopened onto the last attempt's error —
 * or onto the last one's receipt — it would be reporting on something the
 * person has already moved past.
 */
export function useInviteActions() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  // The receipt is a beat, not a state to be dismissed. It has nothing to act
  // on and the card behind it is still the answer, so it hands the panel back
  // on its own rather than leaving a notice for someone to clear.
  useEffect(() => {
    if (!sent) return;
    const timer = setTimeout(() => setSent(false), RECEIPT_MS);
    return () => clearTimeout(timer);
  }, [sent]);

  const reset = useCallback(() => {
    setError(null);
    setSent(false);
  }, []);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    // Held across the await: the field is cleared on success, and the server
    // needs the address that was there when the form was submitted.
    const address = email.trim();
    if (address === "") return;

    setError(null);
    setSent(false);
    startTransition(async () => {
      const result = await sendInvite(address);
      // That it sent is not the news — the address drops off the field and
      // turns up in the list below with a pip spent beside it, which says so
      // already. The spam folder is: the mail comes from Clerk rather than
      // from anyone the recipient knows, so the one thing worth the panel is
      // the place they will have to go looking for it.
      if (result.ok) {
        setEmail("");
        setSent(true);
      } else {
        setError(result.message);
      }
    });
  }

  function revoke(inviteId: string) {
    setError(null);
    setSent(false);
    startTransition(async () => {
      const result = await revokeInvite(inviteId);
      if (!result.ok) setError(result.message);
    });
  }

  return { email, setEmail, error, sent, pending, submit, revoke, reset };
}
