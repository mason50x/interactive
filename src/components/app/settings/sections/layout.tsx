"use client";

import { ArrowDownIcon, ArrowUpIcon } from "@heroicons/react/24/solid";
import {
  Group,
  Row,
  Section,
  Tiles,
} from "@/components/app/settings/primitives";
import { usePreferences } from "@/components/preferences-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { customSpec } from "@/lib/customize";
import { arrangeNav, HOME_HREF, navItems } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** The frame options as a sketch of rail and shell. */
function FrameSketch({ frame }: { frame: "framed" | "floating" | "flush" }) {
  return (
    <span className="flex h-14 w-24 overflow-hidden rounded-md border border-border bg-sidebar">
      <span className="flex w-5 flex-col gap-1 p-1 pt-1.5">
        <span className="h-1 rounded-full bg-primary" />
        <span className="h-1 rounded-full bg-foreground/20" />
        <span className="h-1 rounded-full bg-foreground/20" />
      </span>
      <span
        className={cn(
          "flex-1 bg-surface",
          frame === "framed" && "m-1 rounded-[4px] border border-border",
          frame === "floating" && "m-1.5 rounded-[4px] shadow-card-hover",
          frame === "flush" && "border-l border-border",
        )}
      />
    </span>
  );
}

function RailSketch({ icons }: { icons: boolean }) {
  return (
    <span className="flex h-14 w-24 overflow-hidden rounded-md border border-border bg-sidebar">
      <span
        className={cn("flex flex-col gap-1 p-1 pt-1.5", icons ? "w-4" : "w-10")}
      >
        {[0, 1, 2].map((row) => (
          <span key={row} className="flex items-center gap-0.5">
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-[2px]",
                row === 0 ? "bg-primary" : "bg-foreground/30",
              )}
            />
            {!icons && (
              <span className="h-1 flex-1 rounded-full bg-foreground/20" />
            )}
          </span>
        ))}
      </span>
      <span className="m-1 flex-1 rounded-[4px] border border-border bg-surface" />
    </span>
  );
}

export function LayoutSection() {
  const { preferences, update } = usePreferences();
  const arranged = arrangeNav(navItems, preferences.navOrder, []);

  const move = (href: string, by: -1 | 1) => {
    const order = arranged.map((item) => item.href);
    const from = order.indexOf(href);
    const to = from + by;
    if (to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    update({ navOrder: order });
  };

  const toggle = (href: string, shown: boolean) =>
    update({
      navHidden: shown
        ? preferences.navHidden.filter((entry) => entry !== href)
        : [...preferences.navHidden, href],
    });

  return (
    <Section id="layout" title="Layout">
      <Group title="Frame">
        <Row
          label="Sidebar"
          keywords="rail navigation collapse compact icons labels"
          layout="stack"
        >
          <Tiles
            label="Sidebar"
            columns={2}
            value={preferences.rail}
            onChange={(rail) => update({ rail })}
            options={[
              {
                value: "auto",
                label: "Labels",
                preview: <RailSketch icons={false} />,
              },
              {
                value: "icons",
                label: "Icons only",
                preview: <RailSketch icons />,
              },
            ]}
          />
        </Row>
        <Row
          label="Page frame"
          keywords="shell border margin floating flush edge"
          layout="stack"
        >
          <Tiles
            label="Page frame"
            columns={3}
            value={preferences.frame}
            onChange={(frame) => update({ frame })}
            options={customSpec.frame.options.map((frame) => ({
              value: frame,
              label:
                frame === "framed"
                  ? "Framed"
                  : frame === "floating"
                    ? "Floating"
                    : "Edge to edge",
              preview: <FrameSketch frame={frame} />,
            }))}
          />
        </Row>
        <Row label="Page width" keywords="wide full width container max">
          <SegmentedControl
            aria-label="Page width"
            tone="neutral"
            value={preferences.width}
            onValueChange={(width) => update({ width })}
            options={[
              { value: "contained", label: "Comfortable" },
              { value: "full", label: "Full width" },
            ]}
          />
        </Row>
      </Group>

      <Group title="Navigation">
        <Row label="Open to" keywords="start page landing default home first">
          <Select
            value={preferences.landing}
            onValueChange={(landing) => {
              if (typeof landing === "string")
                update({
                  landing: landing as typeof preferences.landing,
                });
            }}
          >
            <SelectTrigger aria-label="Open to" className="w-44">
              <SelectValue>
                {(value: string) =>
                  navItems.find((item) => item.href === value)?.label ?? value
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {customSpec.landing.options.map((href) => {
                const item = navItems.find((entry) => entry.href === href);
                if (!item) return null;
                const Icon = item.icon.outline;
                return (
                  <SelectItem key={href} value={href}>
                    <Icon className="size-4 shrink-0" />
                    {item.label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </Row>
        <Row
          label="Sidebar destinations"
          keywords="menu reorder hide show items links nav rail order"
          layout="stack"
        >
          <ol className="flex flex-col">
            {arranged.map((item, index) => {
              const shown = !preferences.navHidden.includes(item.href);
              const Icon = item.icon.outline;
              return (
                <li
                  key={item.href}
                  className={cn(
                    "flex h-11 items-center gap-3 transition-opacity",
                    !shown && "opacity-55",
                  )}
                >
                  <Icon className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-[0.875rem] font-medium">
                    {item.label}
                  </span>
                  <button
                    type="button"
                    aria-label={`Move ${item.label} up`}
                    disabled={index === 0}
                    onClick={() => move(item.href, -1)}
                    className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ArrowUpIcon className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${item.label} down`}
                    disabled={index === arranged.length - 1}
                    onClick={() => move(item.href, 1)}
                    className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ArrowDownIcon className="size-4" />
                  </button>
                  <Switch
                    aria-label={`Show ${item.label}`}
                    className="ml-2"
                    checked={shown}
                    disabled={item.href === HOME_HREF}
                    onCheckedChange={(next) => toggle(item.href, next)}
                  />
                </li>
              );
            })}
          </ol>
          {(preferences.navOrder.length > 0 ||
            preferences.navHidden.length > 0) && (
            <button
              type="button"
              onClick={() => update({ navOrder: [], navHidden: [] })}
              className="mt-3 cursor-pointer text-[0.8125rem] font-medium text-primary hover:underline"
            >
              Restore the default order
            </button>
          )}
        </Row>
      </Group>
    </Section>
  );
}
