"use client";

import { Popover } from "@base-ui/react/popover";
import {
  ExclamationTriangleIcon,
  TicketIcon,
} from "@heroicons/react/24/solid";
import { useConvexAuth, useQuery } from "convex/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { Button } from "@/components/ui/button";
import { revokeInvite, sendInvite } from "@/lib/invite-actions";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

export function useInvites() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.invites.mine, isAuthenticated ? {} : "skip") ?? null;
}

function Pips({ remaining, limit }: { remaining: number; limit: number }) {
  return (
    <div aria-hidden className="flex gap-1">
      {Array.from({ length: limit }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-1.5 flex-1 rounded-full transition-colors duration-300",
            index < remaining ? "bg-primary" : "bg-border-strong",
          )}
        />
      ))}
    </div>
  );
}

const RECEIPT_MS = 4000;

const popupClass =
  "popup-slide rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl shadow-black/[0.1] outline-none";

export function HeaderInvites() {
  const invites = useInvites();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const inputRef = useRef<HTMLInputElement>(null);

  const remaining = invites?.remaining ?? 0;
  const limit = invites?.limit ?? 0;
  const hidden = invites === null || limit === 0;
  const exhausted = invites !== null && remaining === 0;

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
    setSent(false);
  }, []);

  useEffect(() => {
    if (open && !sent) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, sent]);

  useEffect(() => {
    if (!sent) return;
    const timer = setTimeout(() => setSent(false), RECEIPT_MS);
    return () => clearTimeout(timer);
  }, [sent]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const address = email.trim();
    if (address === "") return;

    setError(null);
    setSent(false);
    startTransition(async () => {
      const result = await sendInvite(address);
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

  if (hidden) return null;

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else setOpen(true);
      }}
    >
      <Popover.Trigger
        aria-label={`Invites, ${remaining} remaining`}
        className={cn(
          "relative flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[0.875rem] font-medium text-muted-foreground transition-colors outline-none",
          "hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60",
          open && "bg-foreground/[0.05] text-foreground",
        )}
      >
        <TicketIcon className="size-4 shrink-0 text-primary" />
        <span className="hidden sm:inline">Invites</span>
        {remaining > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] leading-none font-semibold text-primary-foreground tabular-nums">
            {remaining}
          </span>
        )}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="end"
          sideOffset={8}
          className="z-50 outline-none"
        >
          <Popover.Popup className={cn(popupClass, "w-[20rem] sm:w-[22rem]")}>
            <div className="flex items-center justify-between pb-2.5">
              <div className="flex items-center gap-2">
                <TicketIcon className="size-4 text-primary" />
                <span className="text-[0.875rem] font-medium text-foreground">
                  Invites
                </span>
              </div>
              <span className="text-[0.8125rem] text-muted-foreground tabular-nums">
                {remaining} left
              </span>
            </div>

            <div className="pb-3">
              <Pips remaining={remaining} limit={limit} />
            </div>

            <div className="border-t border-border pt-3">
              {sent ? (
                <div role="status" className="flex items-start gap-2.5 py-1">
                  <ExclamationTriangleIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="text-[0.8125rem] font-medium text-foreground">
                      Remind them to check the spam or junk
                    </p>
                    <p className="text-[0.75rem] text-muted-foreground">
                      We&rsquo;re working on it.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <form onSubmit={submit} className="flex gap-2">
                    <input
                      ref={inputRef}
                      type="email"
                      name="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      autoComplete="off"
                      disabled={exhausted || pending}
                      placeholder={
                        exhausted ? "No invites left" : "friend@example.com"
                      }
                      aria-label="Email address to invite"
                      className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-[0.8125rem] transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={exhausted || pending || email.trim() === ""}
                      className="h-8 shadow-none hover:shadow-none"
                    >
                      {pending ? "Sending…" : "Send"}
                    </Button>
                  </form>

                  {error && (
                    <p
                      role="status"
                      className="mt-2 text-[0.75rem] leading-relaxed text-destructive"
                    >
                      {error}
                    </p>
                  )}

                  {invites.invites.length > 0 && (
                    <ul className="mt-2.5 flex max-h-36 flex-col overflow-y-auto divide-y divide-border">
                      {invites.invites.map((invite) => (
                        <li
                          key={invite.id}
                          className="group/invite flex h-8 items-center justify-between gap-2 pt-1 pb-1"
                        >
                          <span
                            title={invite.email}
                            className="min-w-0 flex-1 truncate text-[0.8125rem] text-muted-foreground"
                          >
                            {invite.email}
                          </span>

                          {invite.status === "accepted" ? (
                            <span className="text-[0.75rem] text-muted-foreground">
                              Joined
                            </span>
                          ) : (
                            <>
                              <span className="text-[0.75rem] text-muted-foreground group-hover/invite:hidden">
                                Pending
                              </span>
                              <Button
                                variant="ghost"
                                size="xs"
                                disabled={pending}
                                onClick={() => revoke(invite.id)}
                                className="hidden h-6 px-1.5 text-[0.75rem] text-muted-foreground group-hover/invite:inline-flex hover:text-destructive"
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
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
