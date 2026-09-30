"use client";

import { MegaphoneIcon } from "@heroicons/react/24/outline";
import type { FunctionReturnType } from "convex/server";
import { useId } from "react";

import type { api } from "@convex/_generated/api";
import { RailConstellation } from "@/components/app/rail-constellation";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/wordmark";
import { cn } from "@/lib/utils";

export type LiveAnnouncement = NonNullable<
  FunctionReturnType<typeof api.announcement.mine>
>;

/** The words alone, for the preview the admin console draws while editing. */
export type AnnouncementContent = {
  heading: string;
  message?: string;
  updatedAt?: number;
};

/** Blank lines start a new paragraph; single line breaks are kept. */
export function paragraphs(message: string | undefined) {
  return (message ?? "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function postedAt(updatedAt: number | undefined) {
  if (!updatedAt) return null;
  return new Date(updatedAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The page a member sees in place of the app while a full-screen announcement
 * is live: the site's own logo, type and colours, laid out like the invite
 * gate, so it reads as something the team is saying rather than something
 * that has gone wrong.
 *
 * `preview` draws it in place for the admin console rather than over the
 * viewport, smaller and without the constellation behind it. `onSignOut`
 * adds a way out for anyone who wants to switch accounts; the framed
 * `/learn` page has no Clerk around it and leaves it off.
 */
export function AnnouncementScreen({
  announcement,
  preview = false,
  onSignOut,
}: {
  announcement: AnnouncementContent;
  preview?: boolean;
  onSignOut?: () => void;
}) {
  const headingId = useId();
  const body = paragraphs(announcement.message);
  const posted = postedAt(announcement.updatedAt);

  return (
    <div
      role={preview ? undefined : "dialog"}
      aria-modal={preview ? undefined : true}
      aria-labelledby={preview ? undefined : headingId}
      className={cn(
        "isolate flex items-center justify-center bg-background px-6 text-foreground",
        preview
          ? "relative min-h-full py-10"
          : "fixed inset-0 z-[100] overflow-y-auto py-12",
      )}
    >
      {!preview && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_top,black,transparent_70%)]"
        >
          <RailConstellation
            areaPerPoint={13000}
            maxPoints={64}
            className="[--web-fade:0.32] dark:[--web-fade:0.28]"
          />
        </div>
      )}
      <div
        className={cn(
          "flex w-full flex-col items-center text-center",
          preview ? "max-w-sm" : "max-w-lg",
        )}
      >
        <LogoMark
          className={cn("text-primary", preview ? "size-7" : "size-10")}
        />
        <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[0.75rem] font-medium text-primary">
          <MegaphoneIcon aria-hidden className="size-3.5" />
          Announcement
        </span>
        <h1
          id={headingId}
          className={cn(
            "mt-3 font-semibold text-balance break-words",
            preview ? "text-xl" : "text-3xl",
          )}
        >
          {announcement.heading || "Untitled announcement"}
        </h1>
        {body.map((paragraph, index) => (
          <p
            key={index}
            className={cn(
              "mt-3 text-pretty break-words whitespace-pre-line text-muted-foreground",
              preview ? "text-sm" : "text-base",
            )}
          >
            {paragraph}
          </p>
        ))}
        {posted && (
          <p className="mt-8 text-xs text-muted-foreground">Posted {posted}</p>
        )}
        {onSignOut && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(posted ? "mt-2" : "mt-8")}
            onClick={onSignOut}
          >
            Sign out
          </Button>
        )}
      </div>
    </div>
  );
}
