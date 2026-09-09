import type { Feature } from "@/lib/content";

const stroke = "var(--border-strong)";
const ink = "var(--foreground)";
const muted = "var(--muted-foreground)";
const accent = "var(--primary)";

const shell = "h-full w-full";

/** A miniature map: three tiers of nodes with one branch lit up. */
function MapVisual() {
  return (
    <svg viewBox="0 0 320 132" className={shell} aria-hidden>
      <g fill="none" stroke={stroke} strokeWidth="1.25">
        <path d="M78 40 C 112 40, 118 26, 152 26" />
        <path d="M78 40 C 112 40, 118 66, 152 66" />
        <path d="M212 66 C 244 66, 246 100, 268 100" />
      </g>
      <path
        d="M212 26 C 244 26, 246 26, 268 26"
        fill="none"
        stroke={accent}
        strokeWidth="1.5"
        className="animate-dash-flow"
      />
      <rect x="14" y="26" width="64" height="28" rx="9" fill="var(--surface-muted)" stroke={stroke} />
      <rect x="152" y="12" width="60" height="28" rx="9" fill="var(--accent)" stroke={accent} />
      <rect x="152" y="52" width="60" height="28" rx="9" fill="var(--surface-muted)" stroke={stroke} />
      <rect x="268" y="12" width="42" height="28" rx="9" fill={accent} />
      <rect x="268" y="86" width="42" height="28" rx="9" fill="var(--surface-muted)" stroke={stroke} />
      <g fill={muted} fontSize="9.5">
        <text x="30" y="44">Topic</text>
        <text x="164" y="70">Detail</text>
      </g>
      <text x="166" y="30" fontSize="9.5" fill={accent}>
        Expanded
      </text>
    </svg>
  );
}

/** Scrubbable frames: a filmstrip with a playhead. */
function FramesVisual() {
  return (
    <svg viewBox="0 0 320 132" className={shell} aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={14 + i * 76}
          y="18"
          width="64"
          height="52"
          rx="10"
          fill={i === 1 ? "var(--accent)" : "var(--surface-muted)"}
          stroke={i === 1 ? accent : stroke}
        />
      ))}
      <g stroke={muted} strokeWidth="1.25" fill="none" opacity="0.75">
        <path d="M26 56 L38 36 L50 46 L64 30" />
        <path d="M178 56 L190 40 L202 48 L216 34" />
        <path d="M254 56 L266 32 L278 44 L292 38" />
      </g>
      <path d="M102 56 L114 30 L126 44 L140 26" stroke={accent} strokeWidth="1.75" fill="none" />
      <rect x="14" y="92" width="292" height="6" rx="3" fill="var(--surface-muted)" stroke={stroke} />
      <rect x="14" y="92" width="104" height="6" rx="3" fill={accent} />
      <circle cx="118" cy="95" r="7" fill="var(--surface)" stroke={accent} strokeWidth="2" />
      <text x="14" y="120" fontSize="9.5" fill={muted}>
        Step 2 of 9 — substitute and simplify
      </text>
    </svg>
  );
}

/** A forgetting curve with review spikes. */
function RecallVisual() {
  return (
    <svg viewBox="0 0 320 132" className={shell} aria-hidden>
      <g stroke={stroke} strokeWidth="1" opacity="0.7">
        <path d="M14 100 H306" />
        <path d="M14 68 H306" strokeDasharray="3 5" />
      </g>
      <path
        d="M14 30 C 44 74, 58 84, 78 84 L78 40 C 108 78, 124 88, 148 88 L148 34 C 184 74, 200 84, 226 84 L226 28 C 268 60, 286 66, 306 66"
        fill="none"
        stroke={accent}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <g fill={accent}>
        {[78, 148, 226].map((x) => (
          <circle key={x} cx={x} cy="40" r="3.5" />
        ))}
      </g>
      <g fill={muted} fontSize="9.5">
        <text x="14" y="122">Day 1</text>
        <text x="140" y="122">Day 6</text>
        <text x="266" y="122">Day 21</text>
        <text x="14" y="22" fill={ink} fontSize="10">
          Retention
        </text>
      </g>
    </svg>
  );
}

/** A page with a highlighted passage wired to a node. */
function SourceVisual() {
  return (
    <svg viewBox="0 0 320 132" className={shell} aria-hidden>
      <rect x="14" y="14" width="128" height="104" rx="10" fill="var(--surface-muted)" stroke={stroke} />
      <g stroke={muted} strokeWidth="4" strokeLinecap="round" opacity="0.35">
        <path d="M28 36 H126" />
        <path d="M28 50 H112" />
        <path d="M28 78 H120" />
        <path d="M28 92 H98" />
      </g>
      <rect x="24" y="58" width="94" height="12" rx="4" fill="var(--accent)" stroke={accent} />
      <path
        d="M142 64 C 176 64, 178 50, 206 50"
        fill="none"
        stroke={accent}
        strokeWidth="1.5"
        strokeDasharray="4 4"
      />
      <rect x="206" y="34" width="100" height="32" rx="10" fill={accent} />
      <text x="222" y="54" fontSize="11" fill="#fff">
        Osmosis
      </text>
      <text x="206" y="88" fontSize="9.5" fill={muted}>
        Cited: p.148, ¶3
      </text>
    </svg>
  );
}

/** Rough sketch on the left, corrected render on the right. */
function SketchVisual() {
  return (
    <svg viewBox="0 0 320 132" className={shell} aria-hidden>
      <rect x="14" y="18" width="126" height="96" rx="12" fill="var(--surface-muted)" stroke={stroke} strokeDasharray="5 5" />
      <g fill="none" stroke={muted} strokeWidth="1.75" strokeLinecap="round">
        <path d="M38 88 C 52 44, 62 96, 76 52 C 86 22, 96 78, 116 58" />
        <path d="M34 44 L48 40" />
      </g>
      <text x="38" y="108" fontSize="9" fill={muted}>
        your sketch
      </text>
      <path d="M150 66 H176" stroke={accent} strokeWidth="1.5" />
      <path d="M170 60 L178 66 L170 72" fill="none" stroke={accent} strokeWidth="1.5" />
      <rect x="186" y="18" width="120" height="96" rx="12" fill="var(--surface)" stroke={accent} />
      <path
        d="M200 92 C 216 40, 232 40, 248 66 C 262 90, 278 40, 294 40"
        fill="none"
        stroke={accent}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="248" cy="66" r="4" fill={accent} />
      <text x="200" y="108" fontSize="9" fill={muted}>
        corrected
      </text>
    </svg>
  );
}

/** A shared canvas with three live cursors. */
function GroupVisual() {
  const cursors = [
    { x: 92, y: 44, name: "Ana", color: accent },
    { x: 208, y: 82, name: "Jo", color: "#f59e0b" },
    { x: 150, y: 30, name: "Sam", color: "#10b981" },
  ];
  return (
    <svg viewBox="0 0 320 132" className={shell} aria-hidden>
      <rect x="14" y="14" width="292" height="104" rx="12" fill="var(--surface-muted)" stroke={stroke} />
      <g fill="none" stroke={stroke} strokeWidth="1.25">
        <path d="M74 62 H126" />
        <path d="M188 62 H240" />
      </g>
      <rect x="30" y="48" width="44" height="28" rx="8" fill="var(--surface)" stroke={stroke} />
      <rect x="126" y="48" width="62" height="28" rx="8" fill="var(--surface)" stroke={stroke} />
      <rect x="240" y="48" width="46" height="28" rx="8" fill="var(--surface)" stroke={stroke} />
      {cursors.map((c) => (
        <g key={c.name} className="animate-drift" style={{ animationDelay: `${c.x % 5}00ms` }}>
          <path
            d={`M${c.x} ${c.y} l0 13 l3.4 -3.4 l2.4 5.2 l2.6 -1.2 l-2.4 -5.2 l4.8 -0.2 z`}
            fill={c.color}
          />
          <rect x={c.x + 12} y={c.y + 6} width="34" height="15" rx="7" fill={c.color} />
          <text x={c.x + 19} y={c.y + 17} fontSize="9" fill="#fff">
            {c.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

const registry: Record<Feature["visual"], () => React.JSX.Element> = {
  map: MapVisual,
  frames: FramesVisual,
  recall: RecallVisual,
  source: SourceVisual,
  sketch: SketchVisual,
  group: GroupVisual,
};

export function FeatureVisual({ name }: { name: Feature["visual"] }) {
  const Visual = registry[name];
  return <Visual />;
}
