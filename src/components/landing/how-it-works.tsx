import {
  ArrowUpTrayIcon,
  CursorArrowRaysIcon,
  ShareIcon,
} from "@heroicons/react/24/outline";
import { Section, SectionHeading } from "@/components/ui/section";
import { howItWorks } from "@/lib/content";

const icons = [ArrowUpTrayIcon, ShareIcon, CursorArrowRaysIcon];

/**
 * Three steps on one line. The line is a hairline drawn across the row
 * behind the icon discs, which sit on it because they have a background;
 * on a phone the steps stack and the line goes away.
 */
export function HowItWorks() {
  return (
    <Section id="how-it-works" divider width="default" className="bg-surface">
      <SectionHeading
        eyebrow={howItWorks.eyebrow}
        title={howItWorks.heading}
        body={howItWorks.body}
      />

      <ol className="relative mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
        {/* The line the steps sit on. */}
        <div
          aria-hidden
          className="absolute top-6 right-0 left-0 hidden h-px bg-border md:block"
        />
        {howItWorks.steps.map((step, i) => {
          const Icon = icons[i];
          return (
            <li key={step.number} className="relative flex flex-col gap-5">
              <div className="flex items-center gap-4">
                <span className="relative flex size-12 items-center justify-center rounded-full border border-border bg-background text-primary shadow-card">
                  <Icon className="size-5" />
                </span>
                <span className="text-[0.875rem] font-medium text-faint">
                  Step {step.number}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-[1.25rem] font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="max-w-sm text-[0.9375rem] leading-relaxed text-pretty text-muted-foreground">
                  {step.body}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
