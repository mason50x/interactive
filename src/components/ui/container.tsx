import type { ReactNode } from "react";

const widths = {
  default: "max-w-[1400px]",
  narrow: "max-w-4xl",
  prose: "max-w-2xl",
} as const;

export function Container({
  children,
  width = "default",
  className = "",
}: {
  children: ReactNode;
  width?: keyof typeof widths;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full ${widths[width]} px-6 lg:px-10 ${className}`}>
      {children}
    </div>
  );
}
