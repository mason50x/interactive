import { CheckIcon } from "@heroicons/react/16/solid";
import { ink, stroke } from "@/components/landing/palette";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckList } from "@/components/ui/check-list";
import { Section, SectionHeading } from "@/components/ui/section";
import { practice } from "@/lib/content";
import { cn } from "@/lib/utils";

/**
 * The practice band: the argument on the left, and on the right two cards
 * that show it — a recall session with the answer just checked, and the
 * map with the edge the student keeps missing lit up.
 */

/** A recall session, mid-way through, with the answer just checked. */
function RecallCard() {
  const options = [
    { text: "Glycolysis runs out of glucose", state: "idle" },
    { text: "There is no final electron acceptor", state: "correct" },
    { text: "NADH is oxidised too quickly", state: "idle" },
  ] as const;

  return (
    <Card radius="lg" className="p-5 sm:p-6">
      <div className="flex items-center justify-between text-[0.8125rem]">
        <p className="font-medium text-foreground">Cellular respiration</p>
        <p className="text-faint">Card 7 of 12</p>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-[58%] rounded-full bg-primary" />
      </div>

      <p className="mt-6 text-[1.0625rem] leading-snug font-medium text-balance text-foreground">
        Why does the electron transport chain stop without oxygen?
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {options.map((option) => (
          <li
            key={option.text}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-[0.9375rem]",
              option.state === "correct"
                ? "border-success/40 bg-success/8 text-foreground"
                : "border-border text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-full border",
                option.state === "correct"
                  ? "border-success bg-success text-white"
                  : "border-border-strong",
              )}
            >
              {option.state === "correct" ? (
                <CheckIcon className="size-3" />
              ) : null}
            </span>
            {option.text}
          </li>
        ))}
      </ul>

      <div className="mt-5 rounded-xl bg-muted p-4 text-[0.875rem] leading-relaxed text-muted-foreground">
        <p className="font-medium text-foreground">From the source</p>
        <p className="mt-1">
          “Oxygen is the final electron acceptor. Without it, the chain backs
          up, NADH cannot be re-oxidised, and the Krebs cycle stalls.”
        </p>
        <p className="mt-2 text-[0.75rem] text-faint">Chapter 9, p.214</p>
      </div>

      <div className="mt-5 flex items-center justify-between text-[0.8125rem] text-faint">
        <span>Next review in 6 days</span>
        <span className="text-success">Correct</span>
      </div>
    </Card>
  );
}

/** The map, with the weak edge lit. */
function WeakSpot() {
  return (
    <Card radius="lg" className="p-5">
      <div className="flex items-center justify-between text-[0.8125rem]">
        <p className="font-medium text-foreground">Weak spots on your map</p>
        <p className="text-faint">This week</p>
      </div>
      <svg viewBox="0 0 320 120" className="mt-4 h-auto w-full" aria-hidden>
        <g fill="none" stroke={stroke} strokeWidth="1.5">
          <path d="M70 32 H130" />
          <path d="M190 32 H250" />
          <path d="M160 46 V74" />
        </g>
        <path
          d="M160 88 C 160 100, 200 100, 250 100"
          fill="none"
          stroke="var(--destructive)"
          strokeWidth="2"
          className="animate-dash-flow"
        />
        {[
          { x: 10, y: 18, w: 60, label: "Krebs" },
          { x: 130, y: 18, w: 60, label: "NADH" },
          { x: 250, y: 18, w: 60, label: "ETC" },
          { x: 130, y: 74, w: 60, label: "O₂" },
        ].map((n) => (
          <g key={n.label}>
            <rect
              x={n.x}
              y={n.y}
              width={n.w}
              height="28"
              rx="9"
              fill="var(--surface-muted)"
              stroke={stroke}
            />
            <text
              x={n.x + n.w / 2}
              y={n.y + 18}
              textAnchor="middle"
              fontSize="11.5"
              fontWeight="500"
              fill={ink}
            >
              {n.label}
            </text>
          </g>
        ))}
        <rect
          x="250"
          y="86"
          width="60"
          height="28"
          rx="9"
          fill="var(--destructive)"
          opacity="0.12"
          stroke="var(--destructive)"
        />
        <text
          x="280"
          y="104"
          textAnchor="middle"
          fontSize="11.5"
          fontWeight="500"
          fill="var(--destructive)"
        >
          ATP
        </text>
      </svg>
      <p className="mt-3 text-[0.8125rem] text-muted-foreground">
        <span className="text-foreground">Oxygen to ATP</span> missed 3 times in
        a row. Scheduled for tonight.
      </p>
    </Card>
  );
}

export function Practice() {
  return (
    <Section id="practice" divider width="default">
      <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="flex flex-col items-start gap-6 lg:col-span-5">
          <SectionHeading
            eyebrow={practice.eyebrow}
            title={practice.heading}
            body={practice.body}
          />
          <CheckList items={practice.bullets} />
          <ButtonLink
            href="#product"
            variant="outline"
            size="md"
            className="mt-2"
          >
            {practice.cta}
          </ButtonLink>
        </div>

        <div className="grid gap-4 lg:col-span-7 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <RecallCard />
          </div>
          <div className="lg:col-span-2 lg:self-end">
            <WeakSpot />
          </div>
        </div>
      </div>
    </Section>
  );
}
