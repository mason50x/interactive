import type { ReactNode } from "react";

const tabs = ["Map", "Animate", "Practice", "Sources"] as const;

/**
 * Product chrome around a visual, so the marketing artwork reads as the
 * actual app rather than a decorative illustration.
 */
export function AppFrame({
  title,
  activeTab = "Map",
  children,
}: {
  title: string;
  activeTab?: (typeof tabs)[number];
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[1.25rem] border border-panel-border bg-panel-elevated shadow-[0_40px_80px_-40px_rgba(0,0,0,0.8)]">
      <div className="flex items-center gap-4 border-b border-panel-border px-4 py-3">
        <div className="flex shrink-0 gap-1.5" aria-hidden>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <span
              key={c}
              className="h-2.5 w-2.5 rounded-full opacity-70"
              style={{ background: c }}
            />
          ))}
        </div>

        <div className="hidden min-w-0 items-center gap-2 sm:flex">
          <span className="truncate text-xs text-panel-muted">{title}</span>
        </div>

        <div className="ml-auto flex items-center gap-1">
          {tabs.map((tab) => (
            <span
              key={tab}
              className={`rounded-full px-2.5 py-1 text-[0.6875rem] transition-colors ${
                tab === activeTab
                  ? "bg-primary/15 text-primary"
                  : "text-panel-muted/70"
              }`}
            >
              {tab}
            </span>
          ))}
        </div>
      </div>

      <div className="relative">{children}</div>
    </div>
  );
}
