"use client";

import {
  ComputerDesktopIcon,
  RectangleStackIcon,
} from "@heroicons/react/24/outline";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { useState, type FormEvent, type ReactNode } from "react";

import { api } from "@convex/_generated/api";
import { AnnouncementCard } from "@/components/app/announcement/announcement-card";
import {
  AnnouncementScreen,
  postedAt,
} from "@/components/app/announcement/announcement-screen";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { useAuthedQuery } from "@/lib/use-authed-query";
import { cn } from "@/lib/utils";
import styles from "./admin.module.css";

type Current = FunctionReturnType<typeof api.announcement.get>;
type Display = Current["display"];
type Draft = { heading: string; message: string; display: Display };
type Feedback = { message: string; error?: boolean } | null;
type Pending = "save" | "live" | "off" | null;

/** Starting points; every field stays editable. */
const PRESETS: { label: string; draft: Draft }[] = [
  {
    label: "Maintenance",
    draft: {
      heading: "We’re doing a little maintenance",
      message:
        "Rift is taking a short break while we work on things behind the scenes. Nothing you’ve done is lost — check back in a bit.",
      display: "screen",
    },
  },
  {
    label: "Something new",
    draft: {
      heading: "Something new just landed",
      message: "Have a look around — there’s a new addition waiting for you.",
      display: "banner",
    },
  },
  {
    label: "Heads up",
    draft: {
      heading: "A quick heads up",
      message: "",
      display: "banner",
    },
  },
];

const DISPLAYS = [
  {
    value: "screen",
    label: "Full screen",
    icon: <ComputerDesktopIcon />,
  },
  {
    value: "banner",
    label: "Card over the app",
    icon: <RectangleStackIcon />,
  },
] as const satisfies readonly {
  value: Display;
  label: string;
  icon: ReactNode;
}[];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ConvexError && typeof error.data === "string"
    ? error.data
    : fallback;
}

function draftOf(current: Current): Draft {
  return {
    heading: current.heading,
    message: current.message,
    display: current.display,
  };
}

function sameDraft(a: Draft, b: Draft) {
  return (
    a.heading === b.heading &&
    a.message === b.message &&
    a.display === b.display
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">
        {label}
        {hint && (
          <span className="ml-2 font-normal text-muted-foreground">{hint}</span>
        )}
      </span>
      {children}
    </label>
  );
}

/**
 * The status card: whether the announcement is live, since when and by whom,
 * and the one switch. Turning it off is immediate — that is the safe
 * direction. Turning it on opens a confirmation under the switch that says
 * exactly who will see what, and only then goes live; a heading is required
 * before the button enables, and unsaved edits go live with it rather than
 * leaving everyone on the old text.
 */
function Status({
  current,
  draft,
  dirty,
  pending,
  onGoLive,
  onTurnOff,
}: {
  current: Current;
  draft: Draft;
  dirty: boolean;
  pending: Pending;
  onGoLive: () => void;
  onTurnOff: () => void;
}) {
  const [arming, setArming] = useState(false);
  const live = current.enabled;
  const ready = draft.heading.trim() !== "";
  const open = arming && !live;

  const since = postedAt(current.enabledAt);
  const changed = postedAt(current.updatedAt);
  const detail = live
    ? [
        since ? `Since ${since}` : null,
        current.enabledBy ? `turned on by ${current.enabledBy}` : null,
      ]
        .filter(Boolean)
        .join(", ")
    : changed
      ? `Nobody sees anything. Last changed ${changed}${
          current.updatedBy ? ` by ${current.updatedBy}` : ""
        }.`
      : "Nobody sees anything. Write it below, then turn it on when it’s ready.";
  const reach =
    current.display === "screen"
      ? "Members see it as a full-screen notice; CEOs, Co-Owners, and Head Moderators keep the app."
      : "Members see it as a card over the app they can dismiss.";

  return (
    <div className="rounded-xl border border-border p-4 page-sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-56">
          <h2 className="flex items-center gap-2 font-medium">
            <span
              aria-hidden
              className={cn(
                "size-2 rounded-full",
                live ? "bg-success" : "bg-border-strong",
              )}
            />
            {live ? "Live for everyone" : "Off"}
          </h2>
          <p className="mt-1 text-xs text-pretty text-muted-foreground">
            {detail}
            {live && ` · ${reach}`}
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <span className="text-muted-foreground">
            {live ? "On" : open ? "Confirm below" : "Off"}
          </span>
          <Switch
            aria-label="Live for everyone"
            checked={live}
            disabled={pending !== null}
            onCheckedChange={(checked) => {
              setArming(checked);
              if (!checked) onTurnOff();
            }}
          />
        </label>
      </div>
      <div className={styles.reveal} data-open={open}>
        <div className={styles.revealContent}>
          <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm font-medium">Show this to everyone?</p>
            <p className="mt-1 text-xs text-pretty text-muted-foreground">
              {draft.display === "screen"
                ? "Every member is held on a full-screen notice the moment you confirm, until it’s turned off. CEOs, Co-Owners, and Head Moderators keep the app, and can turn it off from anywhere."
                : "Every member sees a card over the app the moment you confirm, until they dismiss it or it’s turned off."}
              {dirty && " Your unsaved edits go live with it."}
            </p>
            {!ready && (
              <p role="alert" className="mt-2 text-xs text-destructive">
                Give it a heading first.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={!ready || pending !== null}
                onClick={() => {
                  onGoLive();
                  setArming(false);
                }}
              >
                {pending === "live"
                  ? "Going live…"
                  : dirty
                    ? "Save and go live"
                    : "Go live"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setArming(false)}
              >
                Not yet
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Editor({ current }: { current: Current }) {
  const save = useMutation(api.announcement.save);
  const turnOff = useMutation(api.announcement.turnOff);
  const [draft, setDraft] = useState<Draft>(() => draftOf(current));
  const [pending, setPending] = useState<Pending>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const live = current.enabled;
  const dirty = !sameDraft(draft, draftOf(current));
  const trimmed = {
    heading: draft.heading.trim(),
    message: draft.message.trim(),
    display: draft.display,
  };

  function update<Key extends keyof Draft>(field: Key, value: Draft[Key]) {
    setDraft((previous) => ({ ...previous, [field]: value }));
  }

  async function run(
    kind: Pending,
    action: () => Promise<unknown>,
    done: string,
  ) {
    if (pending) return;
    setPending(kind);
    setFeedback(null);
    try {
      await action();
      setFeedback({ message: done });
    } catch (error) {
      setFeedback({
        error: true,
        message: errorMessage(error, "That didn’t work. Try again."),
      });
    } finally {
      setPending(null);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    void run(
      "save",
      async () => {
        await save(trimmed);
        setDraft(trimmed);
      },
      live ? "Saved. Everyone sees the new version now." : "Saved.",
    );
  }

  return (
    <section aria-label="Announcement" className="min-w-0 space-y-5">
      <Status
        current={current}
        draft={draft}
        dirty={dirty}
        pending={pending}
        onGoLive={() =>
          void run(
            "live",
            async () => {
              await save({ ...trimmed, enabled: true });
              setDraft(trimmed);
            },
            "Live for everyone.",
          )
        }
        onTurnOff={() =>
          void run("off", () => turnOff(), "Turned off. Nobody sees it now.")
        }
      />

      <form
        onSubmit={submit}
        className="rounded-xl border border-border p-4 page-sm:p-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="font-medium">What everyone sees</h2>
          {live && dirty && (
            <span className="text-xs text-muted-foreground">
              Unsaved — members still see the last saved version
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-pretty text-muted-foreground">
          One notice for the whole site, in Rift’s own voice and style. Saving
          while it’s live updates it for everyone at once.
        </p>

        <div className="mt-4 grid gap-5 page-lg:grid-cols-2">
          <div className="min-w-0 space-y-4">
            <div className="space-y-1.5">
              <span className="text-sm font-medium">
                Start from
                <span className="ml-2 font-normal text-muted-foreground">
                  Optional
                </span>
              </span>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-pressed={sameDraft(draft, preset.draft)}
                    onClick={() => setDraft(preset.draft)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
            <Field label="Heading">
              <Input
                required
                maxLength={120}
                placeholder="We’re doing a little maintenance"
                value={draft.heading}
                onChange={(event) => update("heading", event.target.value)}
              />
            </Field>
            <Field label="Message" hint="Blank lines start a new paragraph">
              <Textarea
                maxLength={2000}
                className="min-h-32"
                placeholder="What’s happening, and when things are back to normal."
                value={draft.message}
                onChange={(event) => update("message", event.target.value)}
              />
            </Field>
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Shown as</span>
              <SegmentedControl
                tone="neutral"
                aria-label="Shown as"
                className="w-fit max-w-full"
                value={draft.display}
                onValueChange={(display) => update("display", display)}
                options={DISPLAYS}
              />
              <p className="text-xs text-pretty text-muted-foreground">
                {draft.display === "screen"
                  ? "Takes the place of the site until it’s turned off. For maintenance, or anything else that should pause the site."
                  : "A card at the top of the app that members can dismiss. For news."}
              </p>
            </div>
          </div>

          <div className="min-w-0 space-y-1.5">
            <span className="text-sm font-medium">
              Preview
              <span className="ml-2 font-normal text-muted-foreground">
                As a member sees it
              </span>
            </span>
            <div className="overflow-hidden rounded-lg border border-border bg-background">
              {draft.display === "screen" ? (
                <div className="h-80 overflow-auto">
                  <AnnouncementScreen
                    preview
                    announcement={{
                      heading: draft.heading,
                      message: draft.message,
                      updatedAt: current.updatedAt,
                    }}
                  />
                </div>
              ) : (
                <div className="flex h-80 items-start justify-center bg-muted/40 px-4 pt-6">
                  <div className="w-full max-w-md">
                    <AnnouncementCard
                      preview
                      announcement={{
                        heading: draft.heading || "Untitled announcement",
                        message: draft.message,
                        display: "banner",
                        updatedAt: current.updatedAt ?? 0,
                        manages: false,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!dirty || pending !== null}>
            {pending === "save"
              ? "Saving…"
              : live
                ? "Save and update everyone"
                : "Save"}
          </Button>
          {dirty && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDraft(draftOf(current))}
            >
              Discard changes
            </Button>
          )}
          {feedback && (
            <p
              role={feedback.error ? "alert" : "status"}
              className={cn(
                "text-sm",
                feedback.error ? "text-destructive" : "text-success",
              )}
            >
              {feedback.message}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}

/**
 * Admins: the one site-wide announcement, on or off for
 * everyone at once. The draft is held locally from the first load, so
 * somebody else's save doesn't wipe half-typed text; the save button knows
 * when the two differ.
 */
export function AnnouncementConfig() {
  const current = useAuthedQuery(api.announcement.get, {});
  if (current === undefined)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading…
      </p>
    );
  return <Editor current={current} />;
}
