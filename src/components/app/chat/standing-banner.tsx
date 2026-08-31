"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { ruleLabel, untilLabel } from "@/lib/chat";
import { useNow } from "@/lib/use-now";
import { useChat } from "@/components/app/chat/chat-provider";
import { cn } from "@/lib/utils";
import { api } from "../../../../convex/_generated/api";

/**
 * What happened to you, and when it stops.
 *
 * The most important thing in the chat interface, and it is here because of a
 * decision made elsewhere: enforcement is automatic and there is nobody to
 * appeal to. A system like that has exactly one obligation, which is to say
 * plainly what it did and why, to the person it did it to. A composer that is
 * simply dead, with no explanation, is indistinguishable from the site being
 * broken — and the person on the other end of it has no way to find out which.
 *
 * So: the rule, the countdown, and every unexpired strike with the words that
 * caused it and the day it stops counting. Nobody else can read any of it.
 *
 * ## Why it grows rather than appears
 *
 * It sits above the thread and takes its height from it, so anything it does
 * moves every message on screen. A banner that blinks into existence takes the
 * line somebody was reading with it. Both of the heights that change here —
 * the banner itself, and the ledger inside it — are animated with the
 * `0fr`/`1fr` grid row, which is the one way to transition to a height nobody
 * has measured. `overflow-hidden` on the inner row is what makes it a clip
 * rather than a squash.
 *
 * The text is held across the way out. When a mute lifts, `profile` stops
 * carrying it in the same tick the banner starts collapsing, and a banner that
 * empties before it closes is a flicker rather than an exit.
 */
export function StandingBanner() {
  const { profile } = useChat();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const ledger = useQuery(api.chat.profiles.ledger, open ? {} : "skip");

  const kind =
    profile === null
      ? null
      : profile.bannedAt !== undefined
        ? "banned"
        : profile.mutedUntil !== undefined
          ? "muted"
          : null;
  const rule = kind === "banned" ? profile?.banRule : profile?.mutedRule;
  const until = profile?.mutedUntil;

  /**
   * The last standing there was, for the length of the way out.
   *
   * Adjusted during render rather than in an effect, which is what React asks
   * for when state is derived from something that changed: an effect would
   * paint one frame of the banner already empty and only then start closing it,
   * which is the flicker this exists to avoid.
   */
  const [held, setHeld] = useState({ kind, rule, until });

  if (
    kind !== null &&
    (held.kind !== kind || held.rule !== rule || held.until !== until)
  ) {
    setHeld({ kind, rule, until });
  }

  const shown = kind === null ? held : { kind, rule, until };

  return (
    // Always mounted, and flat when there is nothing to say. A transition needs
    // both of its ends to exist: an element that arrives already at `1fr` has
    // nothing to grow from, so a banner rendered only once somebody is muted
    // would appear at full height however it was styled.
    <div
      className={cn(
        "grid shrink-0 transition-[grid-template-rows] duration-300 ease-out",
        kind === null ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
      )}
    >
      <div className="overflow-hidden">
        {shown.kind === null ? null : (
          <div
            className={cn(
              "border-b px-4 py-3",
              shown.kind === "banned"
                ? "border-destructive/25 bg-destructive/[0.07]"
                : "border-border bg-surface-muted",
            )}
          >
            {shown.kind === "banned" ? (
              <>
                <p className="text-[0.9375rem] font-medium text-destructive">
                  This account can no longer use chat.
                </p>
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted-foreground">
                  {shown.rule === undefined
                    ? "It was closed for breaking the rules."
                    : `${ruleLabel(shown.rule)}. This one does not lift.`}
                </p>
              </>
            ) : (
              <>
                <p className="text-[0.9375rem] font-medium">
                  You cannot send messages for{" "}
                  {now === null || shown.until === undefined
                    ? "a while"
                    : untilLabel(shown.until, now)}
                  .
                </p>
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted-foreground">
                  {shown.rule === undefined
                    ? "This lifts on its own."
                    : `${ruleLabel(shown.rule)}. This lifts on its own — nobody has to do anything.`}
                </p>

                <button
                  type="button"
                  onClick={() => setOpen(!open)}
                  className="mt-2 text-[0.8125rem] text-primary underline-offset-2 hover:underline"
                >
                  {open ? "Hide what is counted" : "See what is counted"}
                </button>

                <div
                  className={cn(
                    "grid transition-[grid-template-rows] duration-300 ease-out",
                    open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  )}
                >
                  <div className="overflow-hidden">
                    <ul className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                      {(ledger ?? []).map((entry) => (
                        <li
                          key={`${entry.at}-${entry.rule}`}
                          className="text-[0.8125rem]"
                        >
                          <span className="font-medium">
                            {ruleLabel(entry.rule)}
                          </span>
                          <span className="text-faint">
                            {" "}
                            · counts {entry.weight}
                          </span>
                          {entry.excerpt === undefined ? null : (
                            <span className="mt-0.5 block text-muted-foreground">
                              “{entry.excerpt}”
                            </span>
                          )}
                          <span className="mt-0.5 block text-faint">
                            Stops counting{" "}
                            {new Date(entry.expiresAt).toLocaleDateString(
                              undefined,
                              { month: "long", day: "numeric" },
                            )}
                          </span>
                        </li>
                      ))}
                      {ledger !== undefined && ledger.length === 0 ? (
                        <li className="text-[0.8125rem] text-muted-foreground">
                          Nothing is counted against you any more.
                        </li>
                      ) : null}
                    </ul>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
