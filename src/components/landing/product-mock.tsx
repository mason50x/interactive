import {
  BoltIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  PlusIcon,
} from "@heroicons/react/16/solid";
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
 */

type Node = {
  id: string;
  label: string;
  sub?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  accent?: boolean;
};

type Edge = {
  d: string;
  label?: string;
  at?: [number, number];
  flow?: boolean;
  accent?: boolean;
};

const nodes: Node[] = [
  { id: "glucose", label: "Glucose", x: 32, y: 44, w: 132, h: 48 },
  {
    id: "glycolysis",
    label: "Glycolysis",
    sub: "cytosol",
    x: 232,
    y: 44,
    w: 156,
    h: 48,
  },
  { id: "pyruvate", label: "Pyruvate", x: 456, y: 44, w: 132, h: 48 },
  {
    id: "krebs",
    label: "Krebs cycle",
    sub: "matrix",
    x: 444,
    y: 158,
    w: 156,
    h: 48,
  },
  { id: "carriers", label: "NADH + FADH₂", x: 224, y: 262, w: 172, h: 48 },
  {
    id: "oxygen",
    label: "O₂",
    sub: "final acceptor",
    x: 32,
    y: 362,
    w: 132,
    h: 48,
  },
  {
    id: "etc",
    label: "Electron transport chain",
    x: 420,
    y: 362,
    w: 228,
    h: 48,
  },
  {
    id: "atp",
    label: "ATP",
    sub: "32 net",
    x: 700,
    y: 262,
    w: 116,
    h: 48,
    accent: true,
  },
];

const edges: Edge[] = [
  { d: "M164 68 H232", label: "enters", at: [198, 60] },
  { d: "M388 68 H456", label: "yields", at: [422, 60] },
  { d: "M522 92 V158", label: "oxidised", at: [530, 130] },
  {
    d: "M444 182 C 400 182, 372 230, 350 262",
    label: "reduces",
    at: [378, 232],
  },
  { d: "M330 310 C 330 350, 380 378, 420 378", flow: true },
  { d: "M164 386 H420", label: "accepts e⁻", at: [292, 378] },
  {
    d: "M648 380 C 700 376, 730 340, 748 310",
    accent: true,
    flow: true,
    label: "produces",
    at: [722, 352],
  },
];

function MapDiagram({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 848 440"
      className={cn("h-auto w-full", className)}
      aria-hidden
    >
      <defs>
        <marker
          id="pm-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="var(--faint)" />
        </marker>
        <marker
          id="pm-arrow-accent"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="var(--primary)" />
        </marker>
      </defs>

      <g fill="none" strokeLinecap="round">
        {edges.map((e, i) => (
          <g key={i}>
            <path
              d={e.d}
              stroke={e.accent ? "var(--primary)" : "var(--border-strong)"}
              strokeWidth={e.accent ? 2 : 1.5}
              markerEnd={e.accent ? "url(#pm-arrow-accent)" : "url(#pm-arrow)"}
              className={e.flow ? "animate-dash-flow" : undefined}
            />
            {e.label && e.at ? (
              <text
                x={e.at[0]}
                y={e.at[1]}
                textAnchor="middle"
                fontSize="11"
                fill="var(--faint)"
              >
                {e.label}
              </text>
            ) : null}
          </g>
        ))}
      </g>

      {nodes.map((n) => {
        const cx = n.x + n.w / 2;
        const cy = n.y + n.h / 2;
        return (
          <g key={n.id}>
            {n.accent ? (
              <rect
                x={n.x - 6}
                y={n.y - 6}
                width={n.w + 12}
                height={n.h + 12}
                rx="16"
                fill="none"
                stroke="var(--primary)"
                strokeWidth="1"
                opacity="0.35"
              />
            ) : null}
            <rect
              x={n.x}
              y={n.y}
              width={n.w}
              height={n.h}
              rx="12"
              fill={n.accent ? "var(--primary)" : "var(--surface)"}
              stroke={n.accent ? "var(--primary)" : "var(--border-strong)"}
              strokeWidth="1"
            />
            <text
              x={cx}
              y={n.sub ? cy - 3 : cy + 5}
              textAnchor="middle"
              fontSize="14"
              fontWeight="500"
              fill={n.accent ? "#ffffff" : "var(--foreground)"}
            >
              {n.label}
            </text>
            {n.sub ? (
              <text
                x={cx}
                y={cy + 14}
                textAnchor="middle"
                fontSize="10.5"
                fill={n.accent ? "rgba(255,255,255,0.78)" : "var(--faint)"}
              >
                {n.sub}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* The citation, hung off the highlighted node. */}
      <g>
        <path
          d="M758 262 V214"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="1"
          strokeDasharray="3 4"
          opacity="0.7"
        />
        <rect
          x="656"
          y="178"
          width="176"
          height="34"
          rx="9"
          fill="var(--surface)"
          stroke="var(--border-strong)"
        />
        <circle cx="674" cy="195" r="3.5" fill="var(--primary)" />
        <text x="686" y="199" fontSize="11.5" fill="var(--muted-foreground)">
          Source: Chapter 9, p.214
        </text>
      </g>
    </svg>
  );
}

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
    <div
      role="img"
      aria-label="The Interactive Learning app with a concept map of cellular respiration open, a library of courses on the left, and a recall question on the right."
      className={cn(
        "overflow-hidden rounded-[1.25rem] border border-border bg-surface text-left shadow-card sm:rounded-[1.5rem]",
        className,
      )}
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

        {/* Recall panel */}
        <aside className="hidden flex-col gap-4 border-l border-border bg-sidebar p-4 lg:flex">
          <div className="flex items-center justify-between">
            <p className="text-[0.8125rem] font-semibold text-foreground">
              Recall
            </p>
            <p className="text-[0.6875rem] text-faint">7 of 12</p>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-[58%] rounded-full bg-primary" />
          </div>
          <div className="rounded-xl border border-border bg-surface p-3.5 shadow-card">
            <p className="text-[0.8125rem] leading-snug font-medium text-foreground">
              Why does the electron transport chain stop without oxygen?
            </p>
            <ul className="mt-3 flex flex-col gap-1.5 text-[0.75rem]">
              {[
                "Glycolysis runs out of glucose",
                "There is no final electron acceptor",
                "NADH is oxidised too quickly",
              ].map((option, i) => (
                <li
                  key={option}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-2.5 py-2",
                    i === 1
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "size-3 shrink-0 rounded-full border",
                      i === 1
                        ? "border-primary bg-primary"
                        : "border-border-strong",
                    )}
                  />
                  {option}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex h-8 items-center justify-center rounded-lg bg-primary text-[0.75rem] font-medium text-primary-foreground">
              Check answer
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-[0.6875rem] font-medium text-faint">Sources</p>
            {["Chapter 9, p.214", "Lecture 12, 14:02"].map((source) => (
              <div
                key={source}
                className="flex items-center gap-2 text-[0.75rem] text-muted-foreground"
              >
                <span className="size-1.5 rounded-full bg-primary" />
                {source}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
