"use client";

import { ArrowRightIcon } from "@heroicons/react/24/outline";
import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  Squares2X2Icon,
  XMarkIcon,
} from "@heroicons/react/16/solid";
import { isPlaytimeRoute } from "@config/playtime";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { usePlaytimeExhausted } from "@/components/app/playtime-status";
import { usePreferences } from "@/components/preferences-provider";
import { Spinner } from "@/components/ui/spinner";
import { arrangeNav, navItems } from "@/lib/nav";
import { cn } from "@/lib/utils";
import {
  clampFraction,
  layoutDividers,
  layoutRects,
  MAIN,
  PANE_WINDOW_PREFIX,
  planDrop,
  rectStyle,
  WORKSPACE_DRAG_TYPE,
  type DropPlan,
  type Rect,
} from "@/lib/workspace";
import { destinationFor, destinations } from "./destinations";
import { useWorkspace } from "./workspace-provider";

/** Pixels between panes. */
const GAP = 10;
const FULL: Rect = { l: 0, t: 0, w: 1, h: 1 };

const NARROW = "(width < 48rem)";
function subscribeNarrow(onChange: () => void) {
  const query = window.matchMedia(NARROW);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
function useNarrow() {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
}

/**
 * The page area beside the rail: the router's page and whatever else is up.
 *
 * Every pane is absolutely placed from its slot's rectangle, and every pane is
 * rendered in the order it was created no matter which slot it is in, so a
 * frame never moves in the DOM and never reloads. A new layout, a swap, a
 * closed neighbour — each is a change of rectangle, and the rectangles
 * transition, which is all the animation there is.
 *
 * With one pane this is exactly the shell it replaced: the page on its card,
 * no header, the margin all round. Below `md` it stays that way whatever is
 * open — the focused pane fills the stage and the others wait out of sight.
 */
export function WorkspaceStage({ children }: { children: ReactNode }) {
  const workspace = useWorkspace();
  const {
    multi,
    layout,
    sizes,
    slots,
    panes,
    focus,
    zoom,
    dragging,
    setDragging,
    frames,
  } = workspace;
  const narrow = useNarrow();
  const stage = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState(false);
  const [drop, setDrop] = useState<DropPlan | null>(null);
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set());
  const [picking, setPicking] = useState<string | null>(null);

  const rects = layoutRects(layout, sizes);
  const solo = !multi || zoom || narrow;
  const chrome = multi && !narrow;

  function rectOf(id: string): Rect | null {
    if (solo) return id === (multi ? focus : MAIN) ? FULL : null;
    const index = slots.indexOf(id);
    return index < 0 ? null : rects[index];
  }

  function fraction(clientX: number, clientY: number) {
    const box = stage.current?.getBoundingClientRect();
    if (!box) return { x: 0.5, y: 0.5 };
    return {
      x: clampFraction((clientX - box.left) / box.width, 0, 1),
      y: clampFraction((clientY - box.top) / box.height, 0, 1),
    };
  }

  // A drag that ends anywhere — dropped outside, cancelled with Escape —
  // takes the drop zones with it.
  useEffect(() => {
    if (!dragging) return;
    const end = () => {
      setDragging(null);
      setDrop(null);
    };
    window.addEventListener("dragend", end);
    window.addEventListener("drop", end);
    return () => {
      window.removeEventListener("dragend", end);
      window.removeEventListener("drop", end);
    };
  }, [dragging, setDragging]);

  const busy = resizing || dragging !== null;

  const paneIds = [MAIN, ...panes.map((pane) => pane.id)];

  return (
    <div
      ref={stage}
      data-slot="stage"
      data-split={chrome ? "" : undefined}
      className="relative m-3 min-h-0 min-w-0 flex-1"
    >
      {paneIds.map((id) => {
        const pane = panes.find((item) => item.id === id);
        // A closing pane fades out where it stood; a pane out of sight
        // waits in its slot, so it comes back from there.
        const closing = !!pane?.closing;
        const rect = pane?.closing ?? rectOf(id);
        const hidden = !rect;
        const place = rect ?? rects[slots.indexOf(id)] ?? FULL;
        const path = id === MAIN ? workspace.mainPath : (pane?.path ?? null);

        return (
          <section
            key={id}
            aria-label={destinationFor(path).label}
            aria-hidden={hidden || closing || undefined}
            inert={hidden || closing}
            onPointerDownCapture={() => workspace.focusPane(id)}
            data-pane={id}
            style={
              {
                ...rectStyle(place, chrome ? GAP : 0),
                zIndex: id === focus ? 2 : 1,
              } as CSSProperties
            }
            className={cn(
              "absolute",
              // Room for the pane's controls above it, so the page never
              // sits under them.
              chrome && "flex flex-col",
              !resizing &&
                "transition-[left,top,width,height,opacity,scale,visibility] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
              hidden &&
                !closing &&
                "pointer-events-none invisible scale-95 opacity-0 [transition-behavior:allow-discrete]",
              closing && "pointer-events-none scale-95 opacity-0",
              pane && !closing && "workspace-pane-in",
            )}
          >
            {chrome && (
              <PaneHandle
                id={id}
                path={pane && !pane.src ? null : path}
                canChange={!!pane?.src || id === MAIN}
                onChange={() => setPicking(picking === id ? null : id)}
              />
            )}
            <div
              data-slot={id === MAIN ? undefined : "shell"}
              className={cn(
                "relative min-h-0 w-full flex-1 overflow-hidden rounded-2xl",
                !chrome && "h-full",
                id !== MAIN && "border border-border bg-surface",
              )}
            >
              {id === MAIN ? (
                <main
                  data-slot="shell"
                  className="h-full min-h-0 min-w-0 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface"
                >
                  {children}
                </main>
              ) : pane?.src ? (
                <>
                  <iframe
                    ref={(frame) => {
                      if (frame) frames.current.set(id, frame);
                      else frames.current.delete(id);
                    }}
                    name={`${PANE_WINDOW_PREFIX}${id}`}
                    src={pane.src}
                    title={destinationFor(path).label}
                    allow="fullscreen; autoplay; encrypted-media; picture-in-picture; gamepad; microphone; camera; screen-wake-lock; clipboard-read; clipboard-write; display-capture"
                    onLoad={() =>
                      setLoaded((current) => new Set(current).add(id))
                    }
                    className={cn(
                      "size-full border-0 bg-surface transition-opacity duration-300",
                      !loaded.has(id) && "opacity-0",
                      busy && "pointer-events-none",
                    )}
                  />
                  {!loaded.has(id) && (
                    <div className="absolute inset-0 grid place-items-center">
                      <Spinner />
                    </div>
                  )}
                </>
              ) : pane ? (
                <PanePicker
                  onPick={(href) => workspace.fillPane(id, href)}
                  onCancel={() => workspace.closePane(id)}
                  cancelLabel="Close this pane"
                />
              ) : null}
              {picking === id && (
                // Choosing what goes here, over what is here now; the page
                // underneath keeps running until something is picked.
                <div className="workspace-drop-in absolute inset-0 z-[80] bg-surface">
                  <PanePicker
                    onPick={(href) => {
                      setPicking(null);
                      workspace.navigatePane(id, href);
                    }}
                    onCancel={() => setPicking(null)}
                    cancelLabel="Keep what’s here"
                  />
                </div>
              )}
              {busy && id === MAIN && (
                // The router's page can hold frames of its own — a game, a
                // site in Browse — which would swallow the drag.
                <div className="absolute inset-0" />
              )}
            </div>
          </section>
        );
      })}

      {chrome &&
        !zoom &&
        layoutDividers(layout, sizes).map((divider) => (
          <DividerHandle
            key={`${layout}-${divider.key}`}
            divider={divider}
            onStart={() => setResizing(true)}
            onEnd={() => setResizing(false)}
            onMove={(clientX, clientY) => {
              const point = fraction(clientX, clientY);
              workspace.setSize(
                divider.key,
                clampFraction(
                  divider.axis === "x" ? point.x : point.y,
                  divider.min,
                  divider.max,
                ),
              );
            }}
            onStep={(delta) =>
              workspace.setSize(
                divider.key,
                clampFraction(divider.at + delta, divider.min, divider.max),
              )
            }
            onReset={() => workspace.resetSize(divider.key)}
          />
        ))}

      {dragging && !narrow && (
        <div
          className="workspace-drop-in absolute inset-0 z-40 rounded-2xl"
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes(WORKSPACE_DRAG_TYPE)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            const plan = planDrop(
              zoom ? "single" : layout,
              sizes,
              zoom ? 1 : slots.length,
              fraction(event.clientX, event.clientY),
            );
            setDrop((current) =>
              current &&
              current.kind === plan.kind &&
              JSON.stringify(current.rect) === JSON.stringify(plan.rect)
                ? current
                : plan,
            );
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node))
              return;
            setDrop(null);
          }}
          onDrop={(event) => {
            event.preventDefault();
            const href = event.dataTransfer.getData(WORKSPACE_DRAG_TYPE);
            const plan = drop;
            setDrop(null);
            setDragging(null);
            if (!href || !plan) return;
            if (plan.kind === "replace") {
              if (zoom) workspace.replaceSlot(slots.indexOf(focus), href);
              else workspace.replaceSlot(plan.slot, href);
            } else {
              workspace.openPane(href, {
                layout: plan.layout,
                index: plan.index,
              });
            }
          }}
        >
          <div className="absolute inset-0 rounded-2xl bg-sidebar/40 backdrop-blur-[2px]" />
          {drop && (
            <div
              className="absolute grid place-items-center rounded-2xl border-2 border-dashed border-primary bg-primary/15 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={rectStyle(drop.rect, GAP)}
            >
              <DropLabel href={dragging} kind={drop.kind} />
            </div>
          )}
          {!drop && (
            <div className="absolute inset-0 grid place-items-center">
              <p className="rounded-full bg-popover px-4 py-2 text-sm font-medium shadow-lg">
                Drop to open it here
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DropLabel({ href, kind }: { href: string; kind: DropPlan["kind"] }) {
  const destination = destinationFor(href);
  const Icon = destination.icon;
  return (
    <span className="flex items-center gap-2.5 rounded-full bg-popover py-2 pr-4 pl-2 text-sm font-medium shadow-lg">
      <span className="grid size-7 place-items-center rounded-full bg-foreground text-background">
        <Icon className="size-4" />
      </span>
      {kind === "replace"
        ? `Open ${destination.label} here`
        : `Add ${destination.label} here`}
    </span>
  );
}

/**
 * Change, full screen and close: three small icons in a strip of their own
 * above the pane's top-right corner, always there, never over the page.
 */
function PaneHandle({
  id,
  path,
  canChange,
  onChange,
}: {
  id: string;
  /** Null for an empty pane. */
  path: string | null;
  canChange: boolean;
  onChange: () => void;
}) {
  const workspace = useWorkspace();
  const zoomed = workspace.zoom && workspace.focus === id;
  const destination = path === null ? null : destinationFor(path);
  const Icon = destination?.icon ?? Squares2X2Icon;
  return (
    <div className="flex h-7 shrink-0 items-center gap-0.5 pr-1 pl-1.5">
      <p className="mr-auto flex min-w-0 items-center gap-1.5 text-[0.8125rem] font-medium text-muted-foreground">
        <Icon aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate">{destination?.label ?? "New pane"}</span>
      </p>
      {canChange && (
        <HandleButton label="Change what’s here" onClick={onChange}>
          <Squares2X2Icon className="size-3.5" />
        </HandleButton>
      )}
      <HandleButton
        label={zoomed ? "Exit full screen" : "Full screen"}
        onClick={() => workspace.toggleZoom(id)}
      >
        {zoomed ? (
          <ArrowsPointingInIcon className="size-3.5" />
        ) : (
          <ArrowsPointingOutIcon className="size-3.5" />
        )}
      </HandleButton>
      <HandleButton label="Close" onClick={() => workspace.closePane(id)}>
        <XMarkIcon className="size-3.5" />
      </HandleButton>
    </div>
  );
}

function HandleButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-6 place-items-center rounded-md text-muted-foreground/80 transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      {children}
    </button>
  );
}

function DividerHandle({
  divider,
  onStart,
  onEnd,
  onMove,
  onStep,
  onReset,
}: {
  divider: ReturnType<typeof layoutDividers>[number];
  onStart: () => void;
  onEnd: () => void;
  onMove: (clientX: number, clientY: number) => void;
  onStep: (delta: number) => void;
  onReset: () => void;
}) {
  const [active, setActive] = useState(false);
  const vertical = divider.axis === "x";
  const along = rectStyle(
    vertical
      ? { l: 0, t: divider.from, w: 1, h: divider.to - divider.from }
      : { l: divider.from, t: 0, w: divider.to - divider.from, h: 1 },
    GAP,
  );
  const style: CSSProperties = vertical
    ? {
        left: `calc(${divider.at * 100}% - ${GAP}px)`,
        width: GAP * 2,
        top: along.top,
        height: along.height,
      }
    : {
        top: `calc(${divider.at * 100}% - ${GAP}px)`,
        height: GAP * 2,
        left: along.left,
        width: along.width,
      };
  const decrease = vertical ? "ArrowLeft" : "ArrowUp";
  const increase = vertical ? "ArrowRight" : "ArrowDown";
  return (
    <div
      role="separator"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-label="Resize panes"
      aria-valuemin={Math.round(divider.min * 100)}
      aria-valuemax={Math.round(divider.max * 100)}
      aria-valuenow={Math.round(divider.at * 100)}
      tabIndex={0}
      title="Drag to resize · double-click to even out"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setActive(true);
        onStart();
      }}
      onPointerMove={(event) => {
        if (active) onMove(event.clientX, event.clientY);
      }}
      onPointerUp={() => {
        setActive(false);
        onEnd();
      }}
      onPointerCancel={() => {
        setActive(false);
        onEnd();
      }}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 0.1 : 0.025;
        if (event.key === decrease) onStep(-step);
        else if (event.key === increase) onStep(step);
        else if (event.key === "Enter") onReset();
        else return;
        event.preventDefault();
      }}
      style={style}
      className={cn(
        "group/divider absolute z-10 flex touch-none items-center justify-center outline-none",
        vertical ? "cursor-col-resize" : "cursor-row-resize",
      )}
    >
      <span
        className={cn(
          "rounded-full bg-foreground/40 opacity-0 transition-all duration-200 group-hover/divider:opacity-100 group-focus-visible/divider:opacity-100",
          vertical
            ? "h-10 w-1 group-hover/divider:h-20 group-focus-visible/divider:h-20"
            : "h-1 w-10 group-hover/divider:w-20 group-focus-visible/divider:w-20",
          active && (vertical ? "h-20 opacity-100" : "w-20 opacity-100"),
        )}
      />
    </div>
  );
}

/** Every destination, one click from filling a pane. */
function PanePicker({
  onPick,
  onCancel,
  cancelLabel,
}: {
  onPick: (href: string) => void;
  onCancel: () => void;
  cancelLabel: string;
}) {
  const exhausted = usePlaytimeExhausted();
  const {
    preferences: { navOrder, navHidden },
  } = usePreferences();
  const shown = useMemo(
    () =>
      arrangeNav(navItems, navOrder, navHidden).flatMap((item) => {
        const destination = destinations.find(
          (entry) => entry.href === item.href,
        );
        return destination ? [destination] : [];
      }),
    [navOrder, navHidden],
  );

  return (
    <div className="flex h-full overflow-y-auto">
      <div className="m-auto w-full max-w-72 px-4 py-6">
        <p className="mb-2 px-3 text-sm text-muted-foreground">
          Open in this pane
        </p>
        <ul>
          {shown.map((destination, index) => {
            const Icon = destination.icon;
            const disabled = exhausted && isPlaytimeRoute(destination.href);
            return (
              <li
                key={destination.href}
                className="workspace-rise"
                style={{ animationDelay: `${index * 25}ms` }}
              >
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onPick(destination.href)}
                  className="group/row flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[0.9375rem] font-medium text-muted-foreground transition-colors outline-none hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-40"
                >
                  <Icon className="size-5 shrink-0" />
                  <span className="flex-1">{destination.label}</span>
                  <ArrowRightIcon className="size-4 -translate-x-1 opacity-0 transition-[opacity,translate] duration-200 group-hover/row:translate-x-0 group-hover/row:opacity-100" />
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={onCancel}
          className="mt-2 flex h-10 w-full items-center rounded-lg px-3 text-sm text-muted-foreground transition-colors outline-none hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
