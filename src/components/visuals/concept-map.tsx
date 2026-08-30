type Node = {
  id: string;
  label: string;
  sub?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  accent?: boolean;
  dim?: boolean;
};

/**
 * The hero artifact: a worked concept map for cellular respiration, drawn the
 * way the product would render it. Geometry is declared once so the edges and
 * labels stay in sync if a node moves.
 */
const nodes: Node[] = [
  { id: "glucose", label: "Glucose", x: 40, y: 58, w: 152, h: 54 },
  { id: "glycolysis", label: "Glycolysis", sub: "cytosol", x: 262, y: 58, w: 176, h: 54 },
  { id: "pyruvate", label: "Pyruvate", x: 508, y: 58, w: 152, h: 54 },
  { id: "krebs", label: "Krebs cycle", sub: "matrix", x: 500, y: 182, w: 176, h: 54 },
  { id: "carriers", label: "NADH + FADH₂", x: 258, y: 298, w: 196, h: 54 },
  { id: "oxygen", label: "O₂", sub: "final acceptor", x: 40, y: 414, w: 152, h: 54 },
  { id: "etc", label: "Electron transport chain", x: 486, y: 414, w: 258, h: 54 },
  { id: "atp", label: "ATP", sub: "32 net", x: 792, y: 298, w: 128, h: 54, accent: true },
];

const edges: {
  d: string;
  label?: string;
  labelAt?: [number, number];
  flow?: boolean;
  accent?: boolean;
}[] = [
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
];

function center(n: Node) {
  return { cx: n.x + n.w / 2, cy: n.y + n.h / 2 };
}

export function ConceptMap({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 960 500"
      role="img"
      aria-label="Concept map of cellular respiration linking glucose through glycolysis, the Krebs cycle, and the electron transport chain to ATP"
      className={`h-auto w-full ${className}`}
    >
      <defs>
        <pattern id="cm-grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path
            d="M32 0 H0 V32"
            fill="none"
            stroke="var(--panel-border)"
            strokeWidth="1"
            opacity="0.55"
          />
        </pattern>
        <marker
          id="cm-arrow"
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
          id="cm-arrow-accent"
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

      <rect width="960" height="500" fill="url(#cm-grid)" opacity="0.4" />

      {/* Edges sit beneath the nodes so joins stay clean. */}
      <g fill="none" strokeLinecap="round">
        {edges.map((e, i) => (
          <g key={i}>
            <path
              d={e.d}
              stroke={e.accent ? "var(--primary)" : "var(--panel-border)"}
              strokeWidth={e.accent ? 2 : 1.5}
              markerEnd={e.accent ? "url(#cm-arrow-accent)" : "url(#cm-arrow)"}
              className={e.flow ? "animate-dash-flow" : undefined}
              opacity={e.accent ? 1 : 0.9}
            />
            {e.label && e.labelAt ? (
              <text
                x={e.labelAt[0]}
                y={e.labelAt[1]}
                textAnchor="middle"
                fontSize="11"
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
              y={n.sub ? cy - 3 : cy + 5}
              textAnchor="middle"
              fontSize="15"
              fontWeight="500"
              letterSpacing="-0.01em"
              fill={n.accent ? "#ffffff" : "var(--panel-foreground)"}
            >
              {n.label}
            </text>
            {n.sub ? (
              <text
                x={cx}
                y={cy + 14}
                textAnchor="middle"
                fontSize="10.5"
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
          d="M838 226 V284"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="1"
          strokeDasharray="3 4"
          opacity="0.7"
        />
        <rect
          x="700"
          y="196"
          width="212"
          height="30"
          rx="8"
          fill="var(--panel-elevated)"
          stroke="var(--panel-border)"
        />
        <circle cx="716" cy="211" r="3" fill="var(--primary)" />
        <text x="728" y="215" fontSize="11.5" fill="var(--panel-muted)">
          Source: Chapter 9, p.214
        </text>
      </g>
    </svg>
  );
}
