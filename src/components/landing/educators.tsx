import { CheckIcon } from "@heroicons/react/16/solid";
import { educators } from "@/lib/content";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";

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
    "color-mix(in oklab, var(--primary) 30%, transparent)",
    "color-mix(in oklab, var(--primary) 62%, transparent)",
    "var(--primary)",
  ];

  return (
    <div className="rounded-[1.25rem] border border-panel-border bg-panel-elevated p-6 sm:p-7">
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
          <span className="text-panel-foreground">Electron transport chain</span>{" "}
          is unconnected for 19 of 28 students.
        </p>
      </div>
    </div>
  );
}

export function Educators() {
  return (
    <Section id="educators" className="bg-panel text-panel-foreground">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div className="flex flex-col items-start gap-6">
            <SectionHeading
              tone="inverted"
              eyebrow={educators.eyebrow}
              title={educators.heading}
              body={educators.body}
            />
            <ul className="flex flex-col gap-3">
              {educators.bullets.map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-3 text-[0.9375rem] text-panel-foreground/85"
                >
                  <span className="mt-1 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <CheckIcon className="size-3" />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
            <ButtonLink href="/contact" variant="inverted" size="md" className="mt-2">
              {educators.cta}
            </ButtonLink>
          </div>

          <CohortHeatmap />
        </div>
      </Container>
    </Section>
  );
}
