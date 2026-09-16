import { StatList } from "@/components/landing/stat-list";
import { Section } from "@/components/ui/section";
import { stats } from "@/lib/content";

export function Stats() {
  return (
    <Section
      divider
      width="default"
      className="bg-surface py-16 [--section-fill:var(--surface)] sm:py-20 lg:py-20"
    >
      <StatList items={stats.items} size="large" animate />
    </Section>
  );
}
