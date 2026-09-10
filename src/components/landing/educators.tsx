import { accent } from "@/components/landing/palette";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckList } from "@/components/ui/check-list";
import { Section, SectionHeading } from "@/components/ui/section";
import { educators } from "@/lib/content";

/**
 * The band for teaching teams, on the inverted panel: the pitch on the
 * left, and a cohort heatmap on the right that shows the thing a teacher
 * gets from it — which concept a whole class has not connected yet.
 */

/** Cohort heatmap: rows are students, columns are concepts. */
function CohortHeatmap() {
  const concepts = ["Cells", "Enzymes", "Glycolysis", "Krebs", "ETC", "Yield"];
  // Deterministic mastery grid so server and client render identically.
  const grid = [
    [3, 3, 2, 1, 0, 1],
    [3, 2, 2, 0, 0, 1],
    [3, 3, 3, 2, 1, 2],
    [2, 3, 1, 1, 0, 0],
    [3, 3, 2, 1, 1, 2],
    [3, 2, 3, 0, 0, 1],
    [2, 2, 2, 1, 0, 0],
  ];
  const fills = [
    "var(--panel-border)",
    `color-mix(in oklab, ${accent} 30%, transparent)`,
    `color-mix(in oklab, ${accent} 62%, transparent)`,
    accent,
  ];

  return (
    // No resting shadow: the card sits on the dark panel, and the hairline
    // is what lifts it there.
    <Card radius="lg" surface="panel" className="p-6 shadow-none sm:p-7">
      <div className="flex items-baseline justify-between">
        <p className="text-[0.9375rem] font-medium text-panel-foreground">
          Biology 201 · Section 4
        </p>
        <p className="text-[0.8125rem] text-panel-muted">28 students</p>
      </div>

      <div className="mt-6 grid grid-cols-6 gap-1.5">
        {grid.flatMap((row, r) =>
          row.map((v, c) => (
            <span
              key={`${r}-${c}`}
              className="aspect-[2/1] rounded-[5px]"
              style={{ background: fills[v] }}
            />
          )),
        )}
      </div>

      <div className="mt-3 grid grid-cols-6 gap-1.5">
        {concepts.map((c) => (
          <span
            key={c}
            className="truncate text-center text-[0.6875rem] text-panel-muted"
            title={c}
          >
            {c}
          </span>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3 border-t border-panel-border pt-5">
        <span className="size-2 shrink-0 rounded-full bg-primary" />
        <p className="text-[0.875rem] text-panel-muted">
          <span className="text-panel-foreground">
            Electron transport chain
          </span>{" "}
          is unconnected for 19 of 28 students.
        </p>
      </div>
    </Card>
  );
}

export function Educators() {
  return (
    <Section
      id="educators"
      width="default"
      className="bg-panel text-panel-foreground"
    >
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <div className="flex flex-col items-start gap-6">
          <SectionHeading
            tone="inverted"
            eyebrow={educators.eyebrow}
            title={educators.heading}
            body={educators.body}
          />
          <CheckList tone="inverted" items={educators.bullets} />
          <ButtonLink
            href="/contact"
            variant="inverted"
            size="md"
            className="mt-2"
          >
            {educators.cta}
          </ButtonLink>
        </div>

        <CohortHeatmap />
      </div>
    </Section>
  );
}
