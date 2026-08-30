import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={`rounded-[1.5rem] border border-border bg-surface ${
        interactive
          ? "transition-all duration-300 hover:-translate-y-1 hover:border-border-strong hover:shadow-[0_18px_40px_-24px_rgba(15,15,15,0.35)]"
          : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
