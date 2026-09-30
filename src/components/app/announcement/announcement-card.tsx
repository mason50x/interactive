"use client";

import { MegaphoneIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";

import { api } from "@convex/_generated/api";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { paragraphs, type LiveAnnouncement } from "./announcement-screen";

/**
 * The card form of the announcement, over the app rather than in place of it.
 *
 * It says one of two things. For a `banner` announcement it is the notice
 * itself, with the heading and message, and anyone can dismiss it. For a
 * `screen` announcement it only ever reaches an admin — members
 * are behind the screen — and then it says so: the site is showing a notice
 * to everyone else, and here is the switch that takes it down. That switch is
 * the safeguard in the other direction: however it was turned on, it is one
 * click to turn off from wherever a manager happens to be.
 *
 * `preview` is the admin console's: the member's view, nothing wired up.
 */
export function AnnouncementCard({
  announcement,
  preview = false,
  onDismiss,
}: {
  announcement: LiveAnnouncement;
  preview?: boolean;
  onDismiss?: () => void;
}) {
  const turnOff = useMutation(api.announcement.turnOff);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notice = announcement.display === "screen";
  const manages = announcement.manages && !preview;

  async function takeDown() {
    setPending(true);
    setError(null);
    try {
      await turnOff();
    } catch (caught) {
      setError(
        caught instanceof ConvexError && typeof caught.data === "string"
          ? caught.data
          : "Couldn't turn it off. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      role="status"
      className="w-full rounded-2xl border border-border bg-popover p-4 text-popover-foreground shadow-xl shadow-black/[0.12]"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
            notice
              ? "bg-success/10 text-success"
              : "bg-primary/10 text-primary",
          )}
        >
          <MegaphoneIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          {notice ? (
            <>
              <p className="text-sm font-medium">
                Your announcement is live for everyone
              </p>
              <p className="mt-1 text-[0.8125rem] text-pretty text-muted-foreground">
                Members see “{announcement.heading}” as a full-screen notice
                until it’s turned off. You still have the app because you manage
                it.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium break-words">
                {announcement.heading}
              </p>
              {paragraphs(announcement.message).map((paragraph, index) => (
                <p
                  key={index}
                  className="mt-1 text-[0.8125rem] text-pretty break-words whitespace-pre-line text-muted-foreground"
                >
                  {paragraph}
                </p>
              ))}
            </>
          )}
          {manages && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {notice && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => void takeDown()}
                >
                  {pending ? "Turning off…" : "Turn off"}
                </Button>
              )}
              <ButtonLink href="/admin" size="sm" variant="ghost">
                Manage
              </ButtonLink>
              {error && (
                <span role="alert" className="text-xs text-destructive">
                  {error}
                </span>
              )}
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Dismiss"
          className="-mt-1 -mr-1.5 text-muted-foreground"
          disabled={preview}
          onClick={onDismiss}
        >
          <XMarkIcon />
        </Button>
      </div>
    </div>
  );
}
