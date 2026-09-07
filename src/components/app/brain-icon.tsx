import type { ComponentProps } from "react";

export function BrainIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 5a3 3 0 0 0-5.8-1A3.5 3.5 0 0 0 3 9a4 4 0 0 0 0 7 3.5 3.5 0 0 0 4 4 2.75 2.75 0 0 0 5-1.5Zm0 0a3 3 0 0 1 5.8-1A3.5 3.5 0 0 1 21 9a4 4 0 0 1 0 7 3.5 3.5 0 0 1-4 4 2.75 2.75 0 0 1-5-1.5" />
      <path d="M6.2 4A3 3 0 0 0 7 7m-4 2a3 3 0 0 1 3 3m-3 4a3 3 0 0 0 3-2m1 6a3 3 0 0 1 1-4m9.8-12A3 3 0 0 1 17 7m4 2a3 3 0 0 0-3 3m3 4a3 3 0 0 1-3-2m-1 6a3 3 0 0 0-1-4" />
    </svg>
  );
}

export function BrainIconSolid(props: ComponentProps<"svg">) {
  return <BrainIcon {...props} fill="currentColor" fillOpacity={0.2} strokeWidth={1.8} />;
}
