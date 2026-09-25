"use client";

import { Popover } from "@base-ui/react/popover";
import {
  Donut,
  SchoolDayContent,
  useSchoolDay,
} from "@/components/app/home/school-schedule";
import { popupVariants } from "@/components/ui/popup";
import { cn } from "@/lib/utils";

/**
 * The bell schedule in the header: a ring for the class under way, or a grey
 * circle when there isn't one — a dot between classes, a dash when school is
 * out. Opens the same schedule the home page shows.
 */
export function SchoolDayButton() {
  const day = useSchoolDay();
  const { status } = day;
  const inClass =
    status?.state === "in-session" && !status.passing
      ? status.periods[status.index]
      : null;
  const between = status?.state === "in-session" && status.passing;

  const label = inClass
    ? `${inClass.name} · school schedule`
    : between
      ? "Passing time · school schedule"
      : "School schedule";

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={label}
        title={label}
        className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground backdrop-blur-[3px] transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset data-popup-open:text-foreground"
      >
        {inClass && status?.state === "in-session" ? (
          <Donut
            filled={
              (status.seconds - inClass.start * 60) /
              ((inClass.end - inClass.start) * 60)
            }
            size={20}
            stroke={3}
            active
          />
        ) : (
          <IdleMark kind={between ? "dot" : "dash"} />
        )}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-[60] outline-none"
        >
          <Popover.Popup
            className={cn(
              popupVariants({ motion: "drop", padding: "none" }),
              "flex max-h-[min(36rem,var(--available-height))] w-[20rem] flex-col overflow-y-auto px-4 pt-5 pb-3",
            )}
          >
            <SchoolDayContent day={day} compact />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The schedule's "still to come" mark: the ring's track colour, filled. */
function IdleMark({ kind }: { kind: "dot" | "dash" }) {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
      <circle cx="10" cy="10" r="10" className="fill-foreground/[0.08]" />
      {kind === "dot" ? (
        <circle cx="10" cy="10" r="2" className="fill-foreground/40" />
      ) : (
        <path
          d="M6.5 10h7"
          strokeWidth="2"
          strokeLinecap="round"
          className="stroke-foreground/40"
        />
      )}
    </svg>
  );
}
