"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/24/solid";

import { cn } from "@/lib/utils";

/**
 * A closed list of choices, collapsed to one row until it is asked for.
 *
 * The parts are Base UI's, with two deliberate departures from its defaults.
 *
 * `alignItemWithTrigger` is off. Base UI's default lifts the popup over the
 * trigger so the chosen item's text lands exactly where the trigger's text
 * already was — lovely for a native-feeling `<select>`, and it comes at the
 * price of the opening: in that mode the popup has to be in position on the
 * first frame, so Base UI turns the transition off (`data-[side=none]`). A
 * list that grows out from under its trigger is the thing being asked for
 * here, so the popup sits below and animates.
 *
 * The transition is on the popup rather than the positioner, which is what
 * keeps the movement honest: the positioner is where the popup's coordinates
 * get written, and scaling the element those coordinates are measured on is
 * how a menu ends up drifting a few pixels as it opens. Scale and opacity
 * only, from `--transform-origin` — the corner Base UI computes as the point
 * the popup is anchored by — so it unfolds from its trigger rather than
 * swelling out of its own middle.
 */
const Select = SelectPrimitive.Root;

const SelectValue = SelectPrimitive.Value;

const SelectGroup = SelectPrimitive.Group;

const SelectGroupLabel = SelectPrimitive.GroupLabel;

/**
 * The collapsed row. Same shell as the key recorder in the settings sheet —
 * `h-9`, `rounded-lg`, a border that lifts on hover — because the two sit in
 * the same column of the same panel and there is no reason for them to be two
 * different objects.
 */
function SelectTrigger({ className, children, ...props }: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 text-[0.875rem] text-foreground transition-colors outline-none select-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 data-disabled:cursor-not-allowed data-disabled:opacity-50 data-popup-open:bg-muted",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        data-slot="select-icon"
        className="flex shrink-0 text-faint"
      >
        <ChevronUpDownIcon className="size-4" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

/**
 * Portal, positioner, popup and list in one part, because there is no useful
 * arrangement of this control that wants three of the four and not the fourth.
 */
function SelectContent({
  className,
  children,
  sideOffset = 6,
  ...props
}: SelectPrimitive.Popup.Props & {
  sideOffset?: SelectPrimitive.Positioner.Props["sideOffset"];
}) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        data-slot="select-positioner"
        className="z-50 outline-none select-none"
        alignItemWithTrigger={false}
        sideOffset={sideOffset}
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "max-h-[var(--available-height)] min-w-[var(--anchor-width)] origin-[var(--transform-origin)] overflow-hidden rounded-xl border border-border bg-popover bg-clip-padding p-1 text-popover-foreground shadow-lg shadow-black/[0.08] transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-ending-style:duration-150 data-starting-style:scale-95 data-starting-style:opacity-0",
            className,
          )}
          {...props}
        >
          <SelectPrimitive.List
            data-slot="select-list"
            className="max-h-[calc(var(--available-height)-0.5rem)] overflow-y-auto"
          >
            {children}
          </SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

/**
 * One choice.
 *
 * The tick has a column of its own rather than a place at the end, so the
 * labels line up whether or not they are the chosen one and nothing shifts
 * sideways as the selection moves down the list.
 */
function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "grid cursor-pointer grid-cols-[1fr_0.875rem] items-center gap-2 rounded-lg px-2.5 py-2 text-[0.875rem] text-muted-foreground transition-colors outline-none select-none data-highlighted:bg-muted data-highlighted:text-foreground data-selected:text-foreground",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="col-start-1 flex min-w-0 items-center gap-2">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        data-slot="select-item-indicator"
        className="col-start-2 flex text-primary"
      >
        <CheckIcon className="size-3.5" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
