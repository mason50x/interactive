"use client";

import { Popover } from "@base-ui/react/popover";
import { isPlaytimeRoute } from "@config/playtime";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { popupVariants } from "@/components/ui/popup";
import { readStorage, writeStorage } from "@/lib/storage";
import { CHAT_HREF } from "@/lib/nav";
import { cn } from "@/lib/utils";
import {
  freshSizes,
  LAYOUTS,
  layoutPreset,
  layoutRects,
  type LayoutId,
  type Sizes,
} from "@/lib/workspace";
import { TRIED_KEY, useWorkspace } from "./workspace-provider";

const HINTED_KEY = "workspace:hinted";
/** The layout menu has been opened; the rail stops calling it new. */
const SEEN_KEY = "workspace:seen";

function useStored(key: string) {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("storage", onChange);
      return () => window.removeEventListener("storage", onChange);
    },
    () => readStorage(key),
    () => "1",
  );
}

/**
 * The way into split view: a row in the rail, under the destinations.
 *
 * Its icon is the current layout, drawn live, so the rail always shows what
 * the stage is doing. It opens the layout menu. The first time someone is on
 * something to play or watch, it offers — once — to put Chat beside it,
 * which is what most people will want split view for.
 */
export function SplitViewButton() {
  const workspace = useWorkspace();
  const tried = useStored(TRIED_KEY) === "1";
  const seen = useStored(SEEN_KEY) === "1";
  const fresh = !seen && !tried;
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const preset = layoutPreset(workspace.layout);

  if (workspace.isPane) return null;

  return (
    <div className="shrink-0 pb-1 pl-3 max-md:hidden">
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next && !seen) {
            writeStorage(SEEN_KEY, "1");
            window.dispatchEvent(
              new StorageEvent("storage", { key: SEEN_KEY }),
            );
          }
        }}
      >
        <Popover.Trigger
          ref={button}
          className={cn(
            "group relative flex h-11 w-full items-center gap-3 rounded-lg border border-transparent px-3 text-[0.9375rem] font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
            workspace.multi
              ? "text-foreground"
              : "text-muted-foreground transition-[background-color,color] duration-150 hover:bg-foreground/[0.05] hover:text-foreground data-popup-open:bg-foreground/[0.05] data-popup-open:text-foreground",
          )}
          aria-label={
            workspace.multi ? `Split view: ${preset.label}` : "Split view"
          }
          title={
            workspace.multi
              ? `${preset.label} · change layout`
              : "Split view: more than one thing on screen"
          }
        >
          <span className="ml-2 inline-flex h-full min-w-0 items-center gap-3 wide:ml-0">
            <LayoutGlyph
              layout={workspace.layout}
              sizes={workspace.sizes}
              focusIndex={workspace.slots.indexOf(workspace.focus)}
              className={cn(
                "size-5 shrink-0",
                fresh && "workspace-glyph-tease",
              )}
            />
            <span className="sr-only wide:not-sr-only">
              {workspace.multi ? preset.label : "Split view"}
            </span>
          </span>
          {fresh && (
            <span className="absolute top-1 right-0.5 rounded-full bg-primary px-1 py-0.5 text-[0.625rem] leading-none font-semibold text-primary-foreground wide:top-1/2 wide:right-3 wide:-translate-y-1/2 wide:px-1.5 wide:text-xs">
              New
            </span>
          )}
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Positioner
            side="right"
            align="end"
            sideOffset={12}
            collisionPadding={12}
            className="z-[60] outline-none"
          >
            <Popover.Popup
              className={cn(
                popupVariants({ motion: "slide", padding: "none" }),
                "w-[21rem] max-w-[calc(100vw-6rem)] overflow-hidden",
              )}
            >
              <LayoutMenu onDone={() => setOpen(false)} />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <SplitViewHint anchor={button} menuOpen={open} />
    </div>
  );
}

function LayoutMenu({ onDone }: { onDone: () => void }) {
  const workspace = useWorkspace();
  return (
    <div className="p-2">
      <p className="px-2 pt-1 pb-2 text-sm font-medium">Split view</p>
      <div className="grid grid-cols-4 gap-1">
        {LAYOUTS.map((layout) => {
          const current = workspace.layout === layout.id;
          return (
            <button
              key={layout.id}
              type="button"
              onClick={() => {
                if (layout.id === "single") workspace.exitSplit();
                else workspace.setLayout(layout.id);
                onDone();
              }}
              aria-pressed={current}
              title={layout.hint}
              className={cn(
                "group/layout flex flex-col items-center gap-1.5 rounded-lg p-2 text-center transition-[background-color,scale] duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.97]",
                current ? "bg-foreground/[0.07]" : "hover:bg-foreground/[0.04]",
              )}
            >
              <LayoutThumb layout={layout.id} current={current} />
              <span
                className={cn(
                  "text-xs leading-tight",
                  "transition-colors duration-150",
                  current
                    ? "text-foreground"
                    : "text-muted-foreground group-hover/layout:text-foreground",
                )}
              >
                {layout.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A layout, drawn small. Hovering it lights the panes up in turn. */
function LayoutThumb({
  layout,
  current,
}: {
  layout: LayoutId;
  current: boolean;
}) {
  const rects = layoutRects(layout, freshSizes(layout));
  return (
    <span className="relative block aspect-[4/3] w-full">
      {rects.map((rect, index) => (
        <span
          key={index}
          className={cn(
            "workspace-cell absolute rounded-[3px]",
            current
              ? "bg-foreground/70"
              : "bg-foreground/15 group-hover/layout:bg-foreground/30",
          )}
          style={{
            ["--i" as string]: index,
            left: `calc(${rect.l * 100}% + ${rect.l > 0 ? 1.5 : 0}px)`,
            top: `calc(${rect.t * 100}% + ${rect.t > 0 ? 1.5 : 0}px)`,
            width: `calc(${rect.w * 100}% - ${(rect.l > 0 ? 1.5 : 0) + (rect.l + rect.w < 0.999 ? 1.5 : 0)}px)`,
            height: `calc(${rect.h * 100}% - ${(rect.t > 0 ? 1.5 : 0) + (rect.t + rect.h < 0.999 ? 1.5 : 0)}px)`,
          }}
        />
      ))}
    </span>
  );
}

/** The current layout as a 20px icon, the focused pane filled. */
function LayoutGlyph({
  layout,
  sizes,
  focusIndex,
  className,
}: {
  layout: LayoutId;
  sizes: Sizes;
  focusIndex: number;
  className?: string;
}) {
  const rects =
    layout === "single"
      ? layoutRects("columns", { ...sizes, x: 0.5 })
      : layoutRects(layout, sizes);
  const inset = 1.25;
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={className}>
      {rects.map((rect, index) => {
        const x = 1.5 + rect.l * 17;
        const y = 2.5 + rect.t * 15;
        const w = rect.w * 17;
        const h = rect.h * 15;
        const filled = layout !== "single" && index === focusIndex;
        return (
          <rect
            key={index}
            x={x + (rect.l > 0 ? inset / 2 : 0)}
            y={y + (rect.t > 0 ? inset / 2 : 0)}
            width={Math.max(
              0,
              w -
                (rect.l > 0 ? inset / 2 : 0) -
                (rect.l + rect.w < 0.999 ? inset / 2 : 0),
            )}
            height={Math.max(
              0,
              h -
                (rect.t > 0 ? inset / 2 : 0) -
                (rect.t + rect.h < 0.999 ? inset / 2 : 0),
            )}
            rx={1.5}
            className={cn(
              "transition-[x,y,width,height,fill] duration-[460ms] ease-(--ease-workspace)",
              filled ? "fill-current" : "fill-none stroke-current",
            )}
            strokeWidth={1.5}
          />
        );
      })}
    </svg>
  );
}

/**
 * The one-time nudge: on something to play or watch, alone on the stage, a
 * few seconds in — "you can have Chat right here". Either answer puts it
 * away for good.
 */
function SplitViewHint({
  anchor,
  menuOpen,
}: {
  anchor: React.RefObject<HTMLButtonElement | null>;
  menuOpen: boolean;
}) {
  const workspace = useWorkspace();
  const hinted = useStored(HINTED_KEY) === "1";
  const tried = useStored(TRIED_KEY) === "1";
  const [due, setDue] = useState(false);
  const playing = isPlaytimeRoute(workspace.mainPath);
  const eligible =
    !hinted && !tried && !workspace.multi && playing && !menuOpen;

  useEffect(() => {
    if (!eligible) return;
    const timer = window.setTimeout(() => {
      if (window.matchMedia("(width >= 48rem)").matches) setDue(true);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [eligible]);

  const dismiss = () => {
    writeStorage(HINTED_KEY, "1");
    window.dispatchEvent(new StorageEvent("storage", { key: HINTED_KEY }));
    setDue(false);
  };

  return (
    <Popover.Root
      open={due && eligible}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <Popover.Portal>
        <Popover.Positioner
          anchor={anchor}
          side="right"
          align="center"
          sideOffset={14}
          collisionPadding={12}
          className="z-[60] outline-none"
        >
          <Popover.Popup
            initialFocus={false}
            className={cn(
              popupVariants({ motion: "slide", padding: "none" }),
              "workspace-hint w-72 p-4",
            )}
          >
            <Popover.Arrow className="workspace-hint-arrow" />
            <div className="mb-3 flex items-center gap-2">
              <span className="relative grid h-9 w-14 grid-cols-[1.6fr_1fr] gap-0.5 rounded-lg bg-foreground/[0.06] p-1">
                <span className="rounded-[3px] bg-foreground/25" />
                <span className="workspace-hint-pane rounded-[3px] bg-primary" />
              </span>
              <p className="font-semibold">Chat while you play</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Split view keeps Chat open right beside this — or anything else,
              up to four at once.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  dismiss();
                  workspace.openPane(CHAT_HREF, {
                    layout: "columns",
                    index: 1,
                    sizes: { x: 0.68 },
                    background: true,
                  });
                }}
                className="h-9 flex-1 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-[filter,transform] hover:brightness-110 active:scale-[0.98]"
              >
                Try it
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="h-9 rounded-full px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              >
                Not now
              </button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
