import { accent, ink, muted, stroke } from "@/components/landing/palette";
import { cn } from "@/lib/utils";

/**
 * The map on the mock's canvas: cellular respiration, eight nodes and the
 * edges between them, with the product — ATP — lit in the brand colour and
 * a citation hung off it.
 *
 * Plain data up top and one component under it, so the picture can be
 * redrawn by editing coordinates rather than markup. The two arrowheads are
 * `<marker>`s, which is why the ids are prefixed: a marker id is global to
 * the document, and this diagram shares a page with several other SVGs.
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

export function MapDiagram({ className }: { className?: string }) {
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
          <path d="M0 0 L10 5 L0 10 z" fill={accent} />
        </marker>
      </defs>

      <g fill="none" strokeLinecap="round">
        {edges.map((e, i) => (
          <g key={i}>
            <path
              d={e.d}
              stroke={e.accent ? accent : stroke}
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
                stroke={accent}
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
              fill={n.accent ? accent : "var(--surface)"}
              stroke={n.accent ? accent : stroke}
              strokeWidth="1"
            />
            <text
              x={cx}
              y={n.sub ? cy - 3 : cy + 5}
              textAnchor="middle"
              fontSize="14"
              fontWeight="500"
              fill={n.accent ? "#ffffff" : ink}
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
          stroke={accent}
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
          stroke={stroke}
        />
        <circle cx="674" cy="195" r="3.5" fill={accent} />
        <text x="686" y="199" fontSize="11.5" fill={muted}>
          Source: Chapter 9, p.214
        </text>
      </g>
    </svg>
  );
}
