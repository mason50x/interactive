"use client";

import { ExclamationTriangleIcon } from "@heroicons/react/24/solid";
import type { FormEvent, Ref } from "react";
import type { useInvites } from "@/components/app/invite-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * What the invite card unfolds to show: the field and the Send button, the
 * last error under them, and the list of who has already been asked — or,
 * for a few seconds after a send, the receipt in their place.
 *
 * The card owns the state and the shape; this owns nothing, which is what
 * lets the card's file be about growing and shrinking and this one be about
 * the form. `invites` is the live allowance, non-null by the time this is
 * drawn: the card does not exist until the numbers have arrived.
 */
export function InvitePanel({
  invites,
  exhausted,
  inputRef,
  email,
  setEmail,
  error,
  sent,
  pending,
  submit,
  revoke,
}: {
  invites: NonNullable<ReturnType<typeof useInvites>>;
  exhausted: boolean;
  inputRef: Ref<HTMLInputElement>;
  email: string;
  setEmail: (email: string) => void;
  error: string | null;
  sent: boolean;
  pending: boolean;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  revoke: (inviteId: string) => void;
}) {
  if (sent) {
    /* The receipt takes the whole panel rather than sitting under the field
       as a line. The delivery problem is the one thing a sender can do
       anything about, and a caution the width of the card is read; the same
       words in a status line under a form that is ready for the next address
       are not. */
    return (
      <div role="status" className="flex items-start gap-3">
        <ExclamationTriangleIcon className="mt-px size-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-[0.875rem] leading-snug font-medium text-foreground">
            Remind them to check the spam or junk
          </p>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted-foreground">
            We&rsquo;re working on it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={submit} className="flex gap-2">
        <Input
          ref={inputRef}
          type="email"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          // Native validation catches a malformed address before the
          // round trip; the server checks it again, because this one
          // is advisory.
          required
          autoComplete="off"
          disabled={exhausted || pending}
          placeholder={exhausted ? "No invites left" : "friend@example.com"}
          aria-label="Email address to invite"
          className="flex-1"
        />
        <Button
          type="submit"
          size="lg"
          disabled={exhausted || pending || email.trim() === ""}
          // The primary variant carries a brand-coloured glow on
          // hover. That is a marketing-page gesture; in a card this
          // size, sitting in the chrome, it reads as a light leak.
          className="shadow-none hover:shadow-none"
        >
          {pending ? "Sending…" : "Send"}
        </Button>
      </form>

      {error && (
        <p
          // Assertive would talk over the person mid-correction; this
          // is a result they arrive at after submitting, not an
          // interruption.
          role="status"
          className="mt-2.5 text-[0.8125rem] leading-relaxed text-destructive"
        >
          {error}
        </p>
      )}

      {invites.invites.length > 0 && (
        <ul className="mt-2 flex flex-col">
          {invites.invites.map((invite) => (
            <li
              key={invite.id}
              className="group/invite flex h-9 items-center gap-3"
            >
              <span
                title={invite.email}
                className="min-w-0 flex-1 truncate text-[0.875rem] text-muted-foreground"
              >
                {invite.email}
              </span>

              {invite.status === "accepted" ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  Joined
                </span>
              ) : (
                <>
                  {/* Swapped rather than shown side by side: the label
                    is the resting state and the action replaces it,
                    so the row never changes width on hover. */}
                  <span className="shrink-0 text-xs text-faint group-hover/invite:hidden">
                    Pending
                  </span>
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={pending}
                    onClick={() => revoke(invite.id)}
                    className="hidden shrink-0 text-muted-foreground group-hover/invite:inline-flex hover:text-destructive"
                  >
                    Revoke
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
