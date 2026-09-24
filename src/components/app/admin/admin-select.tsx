import type { ComponentProps } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";

export function AdminSelect({
  children,
  ...props
}: Omit<ComponentProps<"select">, "className">) {
  return (
    <span className="relative inline-flex max-w-full min-w-0">
      <select
        className="peer h-9 max-w-full min-w-0 appearance-none rounded-lg border border-border bg-background py-0 pr-9 pl-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-foreground peer-disabled:opacity-50"
      />
    </span>
  );
}
