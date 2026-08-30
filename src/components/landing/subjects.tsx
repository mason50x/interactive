import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";

const groups = [
  {
    title: "Sciences",
    items: ["Cell biology", "Genetics", "Organic chemistry", "Mechanics", "Electromagnetism", "Neuroscience"],
  },
  {
    title: "Mathematics",
    items: ["Linear algebra", "Multivariable calculus", "Discrete math", "Probability", "Real analysis", "Proof writing"],
  },
  {
    title: "Humanities",
    items: ["Modern history", "Political theory", "Philosophy of mind", "Comparative literature", "Linguistics", "Art history"],
  },
  {
    title: "Professional",
    items: ["Anatomy", "Pharmacology", "Constitutional law", "Thermodynamics", "Macroeconomics", "Systems design"],
  },
];

export function Subjects() {
  return (
    <Section id="subjects" className="border-t border-border">
      <Container>
        <SectionHeading
          eyebrow="Coverage"
          title="41 subjects, mapped end to end"
          body="Notation-heavy fields get purpose-built renderers, so a reaction mechanism looks like a reaction mechanism and not a box with words in it."
        />

        <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="label-small border-b border-border pb-3 text-faint">
                {group.title}
              </h3>
              <ul className="mt-4 flex flex-col gap-2.5">
                {group.items.map((item) => (
                  <li key={item}>
                    <a
                      href="#pricing"
                      className="group inline-flex items-center gap-2 text-[0.9375rem] text-foreground/75 transition-colors hover:text-foreground"
                    >
                      <span className="h-1 w-1 rounded-full bg-border-strong transition-colors group-hover:bg-primary" />
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}
