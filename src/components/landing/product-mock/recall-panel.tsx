import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const options = [
  "Glycolysis runs out of glucose",
  "There is no final electron acceptor",
  "NADH is oxidised too quickly",
];

const sources = ["Chapter 9, p.214", "Lecture 12, 14:02"];

/**
 * The mock's right-hand rail: a recall question part way through its deck,
 * with one option chosen and the sources the card was cut from listed
 * underneath. Wide screens only; on anything narrower the canvas needs the
 * room more.
 */
export function RecallPanel() {
  return (
    <aside className="hidden flex-col gap-4 border-l border-border bg-sidebar p-4 lg:flex">
      <div className="flex items-center justify-between">
        <p className="text-[0.8125rem] font-semibold text-foreground">Recall</p>
        <p className="text-[0.6875rem] text-faint">7 of 12</p>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-[58%] rounded-full bg-primary" />
      </div>
      <Card radius="sm" className="p-3.5">
        <p className="text-[0.8125rem] leading-snug font-medium text-foreground">
          Why does the electron transport chain stop without oxygen?
        </p>
        <ul className="mt-3 flex flex-col gap-1.5 text-[0.75rem]">
          {options.map((option, i) => (
            <li
              key={option}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2.5 py-2",
                i === 1
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-border text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "size-3 shrink-0 rounded-full border",
                  i === 1
                    ? "border-primary bg-primary"
                    : "border-border-strong",
                )}
              />
              {option}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex h-8 items-center justify-center rounded-lg bg-primary text-[0.75rem] font-medium text-primary-foreground">
          Check answer
        </div>
      </Card>
      <div className="flex flex-col gap-2">
        <p className="text-[0.6875rem] font-medium text-faint">Sources</p>
        {sources.map((source) => (
          <div
            key={source}
            className="flex items-center gap-2 text-[0.75rem] text-muted-foreground"
          >
            <span className="size-1.5 rounded-full bg-primary" />
            {source}
          </div>
        ))}
      </div>
    </aside>
  );
}
