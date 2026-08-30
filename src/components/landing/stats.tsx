import { stats } from "@/lib/content";
import { Container } from "@/components/ui/container";

export function Stats() {
  return (
    <section className="border-y border-border bg-background py-16 sm:py-20">
      <Container>
        <dl className="grid grid-cols-2 gap-10 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col gap-2">
              <dt className="text-display text-[2.75rem] text-foreground sm:text-[3.25rem]">
                {stat.value}
              </dt>
              <dd className="max-w-[16rem] text-sm leading-relaxed text-muted-foreground">
                {stat.label}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-10 text-xs text-faint">
          Figures reflect Interactive Learning beta cohorts, spring term. Individual results vary.
        </p>
      </Container>
    </section>
  );
}
