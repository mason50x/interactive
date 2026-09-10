import {
  BoltIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  PlusIcon,
} from "@heroicons/react/16/solid";
import { MapDiagram } from "@/components/landing/product-mock/map-diagram";
import { RecallPanel } from "@/components/landing/product-mock/recall-panel";
import { Card } from "@/components/ui/card";
import { LogoMark } from "@/components/wordmark";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * The hero artifact: the app, as it looks with a map open. Drawn in the app's
 * own tokens rather than screenshotted, so it is sharp at every width, follows
 * the theme, and never goes stale against the real product.
 *
 * Nothing in here is interactive. It is a picture of an interface, marked as
 * such for assistive technology, and every "control" is a styled element with
 * no handler.
 *
 * The map on the canvas and the recall rail are their own files under
 * `product-mock/`; what is left here is the window, the library and the
 * canvas chrome around them.
 */

const library = [
  {
    course: "Biology 201",
    items: ["Cellular respiration", "Photosynthesis", "Enzyme kinetics"],
    active: 0,
  },
  {
    course: "Chemistry 110",
    items: ["Bonding and structure", "Stoichiometry"],
  },
  {
    course: "Calculus II",
    items: ["Series convergence"],
  },
];

const tabs = ["Map", "Walkthrough", "Practice", "Sources"] as const;

export function ProductMock({ className }: { className?: string }) {
  return (
    <Card
      radius="lg"
      role="img"
      aria-label="The Interactive Learning app with a concept map of cellular respiration open, a library of courses on the left, and a recall question on the right."
      className={cn("overflow-hidden text-left sm:rounded-[1.5rem]", className)}
    >
      {/* Title bar */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <div className="flex shrink-0 gap-1.5" aria-hidden>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <span
              key={c}
              className="size-2.5 rounded-full opacity-80"
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="mx-auto flex h-7 w-full max-w-md items-center justify-center gap-2 rounded-md bg-muted px-3 text-[0.75rem] text-muted-foreground">
          <LogoMark className="h-[0.6em] w-auto text-faint" />
          <span className="truncate">
            {brand.domain}/maps/cellular-respiration
          </span>
        </div>
        <div className="hidden shrink-0 -space-x-1.5 sm:flex" aria-hidden>
          {["bg-chart-2", "bg-chart-3", "bg-chart-4"].map((c) => (
            <span
              key={c}
              className={cn("size-6 rounded-full border-2 border-surface", c)}
            />
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-[13rem_1fr] lg:grid-cols-[13rem_1fr_16.5rem]">
        {/* Sidebar */}
        <aside className="hidden flex-col gap-5 border-r border-border bg-sidebar px-3 py-4 md:flex">
          <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-[0.75rem] text-faint">
            <MagnifyingGlassIcon className="size-3.5" />
            Search your library
          </div>
          {library.map((group) => (
            <div key={group.course} className="flex flex-col gap-1">
              <p className="px-2 text-[0.6875rem] font-medium text-faint">
                {group.course}
              </p>
              {group.items.map((item, i) => (
                <div
                  key={item}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-[0.8125rem]",
                    group.active === i
                      ? "bg-surface font-medium text-foreground shadow-card"
                      : "text-muted-foreground",
                  )}
                >
                  <DocumentTextIcon
                    className={cn(
                      "size-3.5 shrink-0",
                      group.active === i ? "text-primary" : "text-faint",
                    )}
                  />
                  <span className="truncate">{item}</span>
                </div>
              ))}
            </div>
          ))}
          <div className="mt-auto flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2 text-[0.75rem] text-muted-foreground">
            <BoltIcon className="size-3.5 text-primary" />4 cards due today
          </div>
        </aside>

        {/* Canvas */}
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-2.5 sm:px-5">
            <div className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
              <span className="hidden sm:inline">Biology 201</span>
              <ChevronRightIcon className="hidden size-3.5 text-faint sm:inline" />
              <span className="truncate font-medium text-foreground">
                Cellular respiration
              </span>
            </div>
            <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
              {tabs.map((tab, i) => (
                <span
                  key={tab}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[0.75rem]",
                    i === 0
                      ? "bg-surface font-medium text-foreground shadow-card"
                      : "text-muted-foreground",
                    i > 1 && "hidden sm:inline",
                  )}
                >
                  {tab}
                </span>
              ))}
            </div>
          </div>
          <div className="bg-dots relative flex-1 p-3 sm:p-5">
            <MapDiagram />
            <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-lg border border-border bg-surface p-1 text-faint shadow-card sm:bottom-5 sm:left-5">
              <span className="flex size-6 items-center justify-center rounded-md">
                <PlusIcon className="size-3.5" />
              </span>
              <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <PlayIcon className="size-3.5" />
              </span>
              <span className="px-1.5 text-[0.6875rem]">100%</span>
            </div>
          </div>
        </div>

        <RecallPanel />
      </div>
    </Card>
  );
}
