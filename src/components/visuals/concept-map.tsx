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
  labelAt?: [number, number];
  /** Defaults to `middle`, which is what a label sitting on a horizontal run
   *  wants. A label beside a vertical run wants to start at the line. */
  labelAnchor?: "start" | "middle";
  flow?: boolean;
  accent?: boolean;
};

/** The source citation, anchored to whichever node the layout hangs it off. */
type Callout = {
  /** The dashed leader from the node to the box. */
  leader: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

type Layout = {
  viewBox: string;
  nodes: Node[];
  edges: Edge[];
  callout: Callout;
  /** Type sizes, in user units. They are not shared between the layouts: the
   *  portrait one is drawn on a canvas a third the width, so the same figure
   *  would come out three times smaller on the glass. */
  type: { label: number; sub: number; edge: number; callout: number };
};

/**
 * The hero artifact: a worked concept map for cellular respiration, drawn the
 * way the product would render it. Geometry is declared once so the edges and
 * labels stay in sync if a node moves.
 *
 * There are two of them, and that is the whole point. An SVG scales, but the
 * type inside it scales with it — the landscape map is 960 units across, and
 * squeezed into the ~300px a phone has to spare its 15-unit node labels land
 * at four and a half pixels. Unreadable, on the one picture the page is
 * asking you to read. So the phone gets its own layout: the same eight ideas
 * and the same eight relationships, stacked down a 360-unit canvas where the
 * labels come out near their intended size.
 */
const landscape: Layout = {
  viewBox: "0 0 960 500",
  type: { label: 15, sub: 10.5, edge: 11, callout: 11.5 },
  nodes: [
    { id: "glucose", label: "Glucose", x: 40, y: 58, w: 152, h: 54 },
    { id: "glycolysis", label: "Glycolysis", sub: "cytosol", x: 262, y: 58, w: 176, h: 54 },
    { id: "pyruvate", label: "Pyruvate", x: 508, y: 58, w: 152, h: 54 },
    { id: "krebs", label: "Krebs cycle", sub: "matrix", x: 500, y: 182, w: 176, h: 54 },
    { id: "carriers", label: "NADH + FADH₂", x: 258, y: 298, w: 196, h: 54 },
    { id: "oxygen", label: "O₂", sub: "final acceptor", x: 40, y: 414, w: 152, h: 54 },
    { id: "etc", label: "Electron transport chain", x: 486, y: 414, w: 258, h: 54 },
    { id: "atp", label: "ATP", sub: "32 net", x: 792, y: 298, w: 128, h: 54, accent: true },
  ],
  edges: [
    { d: "M192 85 H262", label: "enters", labelAt: [227, 76] },
    { d: "M438 85 H508", label: "yields", labelAt: [473, 76] },
    { d: "M584 112 V182", label: "oxidized", labelAt: [592, 150] },
    {
      d: "M500 209 C 448 209, 420 260, 400 298",
      label: "reduces",
      labelAt: [430, 262],
    },
    { d: "M370 352 C 370 400, 420 428, 486 428", flow: true },
    { d: "M192 441 H486", label: "accepts e⁻", labelAt: [320, 432] },
    {
      d: "M744 435 C 806 430, 830 396, 838 352",
      accent: true,
      flow: true,
      label: "produces",
      labelAt: [812, 400],
    },
  ],
  callout: { leader: "M838 226 V284", x: 700, y: 196, w: 212, h: 30 },
};

const portrait: Layout = {
  viewBox: "0 0 360 736",
  type: { label: 17, sub: 12, edge: 12.5, callout: 13 },
  nodes: [
    { id: "glucose", label: "Glucose", x: 110, y: 6, w: 140, h: 44 },
    { id: "glycolysis", label: "Glycolysis", sub: "cytosol", x: 92, y: 88, w: 176, h: 52 },
    { id: "pyruvate", label: "Pyruvate", x: 110, y: 178, w: 140, h: 44 },
    { id: "krebs", label: "Krebs cycle", sub: "matrix", x: 92, y: 260, w: 176, h: 52 },
    { id: "carriers", label: "NADH + FADH₂", x: 75, y: 350, w: 210, h: 44 },
    { id: "oxygen", label: "O₂", sub: "final acceptor", x: 10, y: 432, w: 148, h: 52 },
    { id: "etc", label: "Electron transport chain", x: 54, y: 522, w: 252, h: 44 },
    { id: "atp", label: "ATP", sub: "32 net", x: 118, y: 604, w: 124, h: 52, accent: true },
  ],
  edges: [
    { d: "M180 50 V88", label: "enters", labelAt: [190, 73], labelAnchor: "start" },
    { d: "M180 140 V178", label: "yields", labelAt: [190, 163], labelAnchor: "start" },
    { d: "M180 222 V260", label: "oxidized", labelAt: [190, 245], labelAnchor: "start" },
    { d: "M180 312 V350", label: "reduces", labelAt: [190, 335], labelAnchor: "start" },
    {
      d: "M180 394 V522",
      flow: true,
      label: "feeds",
      labelAt: [190, 464],
      labelAnchor: "start",
    },
    {
      // Arrives vertically rather than along the top edge, so the arrowhead
      // points into the box instead of skimming its corner.
      d: "M84 484 C 84 502, 104 504, 104 522",
      label: "accepts e⁻",
      labelAt: [10, 512],
      labelAnchor: "start",
    },
    {
      d: "M180 566 V604",
      accent: true,
      flow: true,
      label: "produces",
      labelAt: [190, 589],
      labelAnchor: "start",
    },
  ],
  callout: { leader: "M180 656 V688", x: 62, y: 688, w: 236, h: 34 },
};

const description =
  "Concept map of cellular respiration linking glucose through glycolysis, the Krebs cycle, and the electron transport chain to ATP";

function center(n: Node) {
  return { cx: n.x + n.w / 2, cy: n.y + n.h / 2 };
}

/** Both layouts are in the document at once, so their `defs` cannot share the
 *  names they are referenced by. */
function Diagram({
  layout,
  id,
  className,
}: {
  layout: Layout;
  id: string;
  className: string;
}) {
  const { viewBox, nodes, edges, callout, type } = layout;
  const [, , vw, vh] = viewBox.split(" ").map(Number);
  const grid = `${id}-grid`;
  const arrow = `${id}-arrow`;
  const arrowAccent = `${id}-arrow-accent`;

  return (
    <svg
      viewBox={viewBox}
      role="img"
      aria-label={description}
      className={`h-auto w-full ${className}`}
    >
      <defs>
        <pattern id={grid} width="32" height="32" patternUnits="userSpaceOnUse">
          <path
            d="M32 0 H0 V32"
            fill="none"
            stroke="var(--panel-border)"
            strokeWidth="1"
            opacity="0.55"
          />
        </pattern>
        <marker
          id={arrow}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="var(--panel-muted)" />
        </marker>
        <marker
          id={arrowAccent}
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

      <rect width={vw} height={vh} fill={`url(#${grid})`} opacity="0.4" />

      {/* Edges sit beneath the nodes so joins stay clean. */}
      <g fill="none" strokeLinecap="round">
        {edges.map((e, i) => (
          <g key={i}>
            <path
              d={e.d}
              stroke={e.accent ? "var(--primary)" : "var(--panel-border)"}
              strokeWidth={e.accent ? 2 : 1.5}
              markerEnd={e.accent ? `url(#${arrowAccent})` : `url(#${arrow})`}
              className={e.flow ? "animate-dash-flow" : undefined}
              opacity={e.accent ? 1 : 0.9}
            />
            {e.label && e.labelAt ? (
              <text
                x={e.labelAt[0]}
                y={e.labelAt[1]}
                textAnchor={e.labelAnchor ?? "middle"}
                fontSize={type.edge}
                fill="var(--panel-muted)"
              >
                {e.label}
              </text>
            ) : null}
          </g>
        ))}
      </g>

      {nodes.map((n) => {
        const { cx, cy } = center(n);
        return (
          <g key={n.id}>
            {n.accent ? (
              <>
                <circle
                  cx={cx}
                  cy={cy}
                  r="5"
                  fill="var(--primary)"
                  opacity="0.35"
                  className="animate-pulse-ring"
                />
                <rect
                  x={n.x - 5}
                  y={n.y - 5}
                  width={n.w + 10}
                  height={n.h + 10}
                  rx="18"
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="1"
                  opacity="0.35"
                />
              </>
            ) : null}
            <rect
              x={n.x}
              y={n.y}
              width={n.w}
              height={n.h}
              rx="14"
              fill={n.accent ? "var(--primary)" : "var(--panel-elevated)"}
              stroke={n.accent ? "var(--primary)" : "var(--panel-border)"}
              strokeWidth="1"
            />
            <text
              x={cx}
              y={n.sub ? cy - 3 : cy + type.label / 3}
              textAnchor="middle"
              fontSize={type.label}
              fontWeight="500"
              letterSpacing="-0.01em"
              fill={n.accent ? "#ffffff" : "var(--panel-foreground)"}
            >
              {n.label}
            </text>
            {n.sub ? (
              <text
                x={cx}
                y={cy + type.sub + 3.5}
                textAnchor="middle"
                fontSize={type.sub}
                fill={n.accent ? "rgba(255,255,255,0.75)" : "var(--panel-muted)"}
              >
                {n.sub}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* Source citation callout, anchored to the highlighted node. */}
      <g>
        <path
          d={callout.leader}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="1"
          strokeDasharray="3 4"
          opacity="0.7"
        />
        <rect
          x={callout.x}
          y={callout.y}
          width={callout.w}
          height={callout.h}
          rx="8"
          fill="var(--panel-elevated)"
          stroke="var(--panel-border)"
        />
        <circle cx={callout.x + 16} cy={callout.y + callout.h / 2} r="3" fill="var(--primary)" />
        <text
          x={callout.x + 28}
          y={callout.y + callout.h / 2 + type.callout / 3}
          fontSize={type.callout}
          fill="var(--panel-muted)"
        >
          Source: Chapter 9, p.214
        </text>
      </g>
    </svg>
  );
}

/**
 * Both layouts are rendered and one is hidden, rather than picked in JS. The
 * choice is a media query either way, and doing it in CSS keeps this a server
 * component and keeps the right map on screen from the first paint — a
 * `matchMedia` read would land after hydration, which is a visible swap on the
 * one piece of artwork above the fold.
 */
export function ConceptMap({ className = "" }: { className?: string }) {
  return (
    <>
      <Diagram layout={portrait} id="cm-sm" className={`sm:hidden ${className}`} />
      <Diagram
        layout={landscape}
        id="cm-lg"
        className={`hidden sm:block ${className}`}
      />
    </>
  );
}
