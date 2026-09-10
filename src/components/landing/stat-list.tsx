import { cn } from "@/lib/utils";

/**
 * A row of figures with what each one counts under it.
 *
 * A `dl`, because a figure and its label are a term and its description, and
 * a screen reader pairs them that way. Two sizes: `large` is the stats band
 * on the landing page, where each figure is ruled off on the left and the
 * label is given room to run to two lines; `default` is the compact row of
 * facts under the about page's intro.
 */
export function StatList({
  items,
  size = "default",
  className,
}: {
  items: readonly { value: string; label: string }[];
  size?: "default" | "large";
  className?: string;
}) {
  const large = size === "large";

  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-x-6 lg:grid-cols-4",
        large ? "gap-y-10" : "gap-y-8",
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "flex flex-col",
            large ? "gap-2 border-l border-border pl-5" : "gap-1.5",
          )}
        >
          <dt
            className={cn(
              "text-display text-foreground",
              large
                ? "text-[2.5rem] sm:text-[3rem]"
                : "text-[2.25rem] sm:text-[2.75rem]",
            )}
          >
            {item.value}
          </dt>
          <dd
            className={cn(
              "text-[0.9375rem] text-muted-foreground",
              large && "max-w-[14rem] leading-relaxed",
            )}
          >
            {item.label}
          </dd>
        </div>
      ))}
    </dl>
  );
}
