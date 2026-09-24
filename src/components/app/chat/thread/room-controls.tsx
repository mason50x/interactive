"use client";

import { Popover } from "@base-ui/react/popover";
import { ShieldCheckIcon } from "@heroicons/react/24/solid";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, InputAddon, InputGroup } from "@/components/ui/input";
import { popupVariants } from "@/components/ui/popup";
import { SegmentedControl } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { RoomControls as Controls } from "@convex/chat/roomControls";

/** The same intervals as `SLOW_MODE_SECONDS` on the server, which decides. */
const SLOW_MODES = [
  { value: "0", label: "Off" },
  { value: "5", label: "5s" },
  { value: "10", label: "10s" },
  { value: "30", label: "30s" },
  { value: "60", label: "1m" },
  { value: "300", label: "5m" },
] as const;

const COUNTS = [
  { value: "10", label: "10" },
  { value: "25", label: "25" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
] as const;

type SlowMode = (typeof SLOW_MODES)[number]["value"];
type Count = (typeof COUNTS)[number]["value"];

function errorText(error: unknown, fallback: string): string {
  return error instanceof ConvexError && typeof error.data === "string"
    ? error.data
    : fallback;
}

/**
 * The Mod Tools button in the Everyone room's header, for moderators and
 * above: lock the room, slow it down, or delete its recent messages in bulk.
 *
 * Only drawn for staff who can delete messages; the server checks the same
 * thing on every change. Lock and slow mode commit as soon as they are
 * pressed. Deleting takes a second press, because it cannot be undone.
 */
export function RoomControls({
  conversationId,
  controls,
}: {
  conversationId: Id<"conversations">;
  controls: Controls | undefined;
}) {
  const set = useMutation(api.chat.roomControls.set);
  const bulkDelete = useMutation(api.chat.roomControls.bulkDelete);

  const [count, setCount] = useState<Count>("25");
  const [handle, setHandle] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    text: string;
    problem: boolean;
  } | null>(null);

  const locked = controls?.locked ?? false;
  const slowMode = String(controls?.slowModeSeconds ?? 0) as SlowMode;
  const active = locked || slowMode !== "0";

  async function change(next: { locked?: boolean; slowModeSeconds?: number }) {
    setNotice(null);
    try {
      await set({ conversationId, ...next });
    } catch (error) {
      setNotice({
        text: errorText(error, "That change could not be saved. Try again."),
        problem: true,
      });
    }
  }

  async function remove() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const target = handle.trim();
      const { deleted, skipped } = await bulkDelete({
        conversationId,
        count: Number(count),
        handle: target === "" ? undefined : target,
      });
      const words =
        deleted === 0
          ? "There was nothing to delete."
          : `Deleted ${deleted} ${deleted === 1 ? "message" : "messages"}.`;
      setNotice({
        text:
          skipped > 0
            ? `${words} ${skipped} from senior staff ${skipped === 1 ? "was" : "were"} left in place.`
            : words,
        problem: false,
      });
      setHandle("");
    } catch (error) {
      setNotice({
        text: errorText(
          error,
          "Those messages could not be deleted. Try again.",
        ),
        problem: true,
      });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <Popover.Root
      onOpenChangeComplete={(shown) => {
        if (shown) return;
        setConfirming(false);
        setNotice(null);
      }}
    >
      <Popover.Trigger className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 data-popup-open:bg-foreground/[0.06] data-popup-open:text-foreground">
        <span>Mod Tools</span>
        <ShieldCheckIcon
          className={cn("size-5", active && "text-primary")}
          aria-hidden="true"
        />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="end"
          sideOffset={8}
          className="z-50 outline-none"
        >
          <Popover.Popup
            className={cn(
              popupVariants({ motion: "drop", padding: "lg" }),
              "flex w-[20rem] max-w-[calc(100vw-2rem)] flex-col gap-4",
            )}
          >
            <Popover.Title
              render={<p />}
              className="text-[0.875rem] font-semibold"
            >
              Room controls
            </Popover.Title>

            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-[0.875rem] font-medium">
                  Lock room
                </span>
                <span className="block text-[0.8125rem] text-muted-foreground">
                  Only staff can post while it is locked.
                </span>
              </span>
              <Switch
                checked={locked}
                disabled={controls === undefined}
                onCheckedChange={(checked) => void change({ locked: checked })}
              />
            </label>

            <div className="flex flex-col gap-2">
              <span className="min-w-0">
                <span className="block text-[0.875rem] font-medium">
                  Slow mode
                </span>
                <span className="block text-[0.8125rem] text-muted-foreground">
                  How long each person waits between messages.
                </span>
              </span>
              <SegmentedControl
                aria-label="Slow mode"
                value={slowMode}
                onValueChange={(value) =>
                  void change({ slowModeSeconds: Number(value) })
                }
                options={SLOW_MODES}
                className="h-9 w-full justify-between [&>button]:flex-1 [&>button]:justify-center [&>button]:px-0"
              />
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <span className="min-w-0">
                <span className="block text-[0.875rem] font-medium">
                  Delete recent messages
                </span>
                <span className="block text-[0.8125rem] text-muted-foreground">
                  The newest messages in this room, or only one person’s.
                </span>
              </span>
              <SegmentedControl
                aria-label="How many messages"
                value={count}
                onValueChange={(value) => {
                  setCount(value);
                  setConfirming(false);
                }}
                options={COUNTS}
                className="h-9 w-full justify-between [&>button]:flex-1 [&>button]:justify-center [&>button]:px-0"
              />
              <InputGroup className="gap-1.5">
                <InputAddon>@</InputAddon>
                <Input
                  value={handle}
                  onChange={(event) => {
                    setHandle(event.target.value.replace(/^@/, ""));
                    setConfirming(false);
                  }}
                  placeholder="Anyone"
                  spellCheck={false}
                  autoComplete="off"
                  aria-label="Only from this person (optional)"
                  maxLength={64}
                />
              </InputGroup>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => void remove()}
                onBlur={() => setConfirming(false)}
              >
                {busy
                  ? "Deleting…"
                  : confirming
                    ? `Confirm: delete ${count}`
                    : `Delete last ${count}`}
              </Button>
            </div>

            {notice === null ? null : (
              <p
                role="status"
                className={cn(
                  "text-[0.8125rem] leading-snug",
                  notice.problem ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {notice.text}
              </p>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
