import { stats } from "@/lib/content";
import { Container } from "@/components/ui/container";

export function Stats() {
  return (
    <section className="border-b border-border bg-surface py-16 sm:py-20">
      <Container>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
          {stats.items.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col gap-2 border-l border-border pl-5"
            >
              <dt className="text-display text-[2.5rem] text-foreground sm:text-[3rem]">
                {stat.value}
              </dt>
              <dd className="max-w-[14rem] text-[0.9375rem] leading-relaxed text-muted-foreground">
                {stat.label}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-10 text-[0.8125rem] text-faint">{stats.footnote}</p>
      </Container>
    </section>
  );
}
