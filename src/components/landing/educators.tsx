import { educators } from "@/lib/content";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/section";

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
  ];
  const fills = [
    "var(--surface-muted)",
    "color-mix(in oklab, var(--primary) 22%, transparent)",
    "color-mix(in oklab, var(--primary) 55%, transparent)",
    "var(--primary)",
  ];

  return (
    <div className="rounded-[1.5rem] border border-border bg-surface p-7">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-foreground">BIO 201 · Section 4</p>
        <p className="text-xs text-faint">28 students</p>
      </div>

      <div className="mt-6 grid grid-cols-6 gap-1.5">
        {grid.flatMap((row, r) =>
          row.map((v, c) => (
            <span
              key={`${r}-${c}`}
              className="aspect-square rounded-[5px]"
              style={{ background: fills[v] }}
            />
          )),
        )}
      </div>

      <div className="mt-3 grid grid-cols-6 gap-1.5">
        {concepts.map((c) => (
          <span
            key={c}
            className="truncate text-center text-[0.625rem] text-faint"
            title={c}
          >
            {c}
          </span>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3 border-t border-border pt-5">
        <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
        <p className="text-[0.8125rem] text-muted-foreground">
          <span className="text-foreground">Electron transport chain</span> is
          unconnected for 19 of 28 students.
        </p>
      </div>
    </div>
  );
}

export function Educators() {
  return (
    <section id="educators" className="border-t border-border bg-surface-muted py-20 sm:py-28 lg:py-36">
      <Container>
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <div className="flex flex-col items-start gap-5">
            <Eyebrow>{educators.eyebrow}</Eyebrow>
            <h2 className="text-display text-[2.25rem] sm:text-[3rem] lg:text-[3.5rem]">
              {educators.heading}
            </h2>
            <p className="max-w-lg text-[1.0625rem] leading-relaxed text-muted-foreground">
              {educators.body}
            </p>
            <ul className="mt-2 flex flex-col gap-3">
              {educators.bullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-[0.9375rem] text-foreground/80">
                  <svg viewBox="0 0 16 16" width="16" height="16" className="mt-0.5 shrink-0 text-primary" aria-hidden>
                    <circle cx="8" cy="8" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M4.8 8.2 7 10.4l4.2-4.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {b}
                </li>
              ))}
            </ul>
            <ButtonLink href="#pricing" variant="secondary" size="xl" className="mt-4">
              {educators.cta}
            </ButtonLink>
          </div>

          <CohortHeatmap />
        </div>
      </Container>
    </section>
  );
}
