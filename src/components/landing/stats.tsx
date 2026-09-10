import { StatList } from "@/components/landing/stat-list";
import { Section } from "@/components/ui/section";
import { stats } from "@/lib/content";

/**
 * Four figures from the pilot cohorts, and the line that says where they
 * came from. Shallower than the bands around it, on the lifted surface, with
 * a hairline underneath — a ledger between two arguments, not an argument
 * itself.
 */
export function Stats() {
  return (
    <Section
      width="default"
      className="border-b border-border bg-surface py-16 sm:py-20 lg:py-20"
    >
      <StatList items={stats.items} size="large" />
      <p className="mt-10 text-[0.8125rem] text-faint">{stats.footnote}</p>
    </Section>
  );
}
