import { OutlineIcon, type IconProps } from "@/components/ui/icon";

/**
 * A brain, in the outline cut, because Heroicons has none. The solid cut is
 * `BrainIconSolid` in `nav-icons.tsx`, drawn in parts so it can move.
 */
export function BrainIcon(props: IconProps) {
  return (
    <OutlineIcon {...props}>
      <path d="M12 5a3 3 0 0 0-5.8-1A3.5 3.5 0 0 0 3 9a4 4 0 0 0 0 7 3.5 3.5 0 0 0 4 4 2.75 2.75 0 0 0 5-1.5Zm0 0a3 3 0 0 1 5.8-1A3.5 3.5 0 0 1 21 9a4 4 0 0 1 0 7 3.5 3.5 0 0 1-4 4 2.75 2.75 0 0 1-5-1.5" />
      <path d="M6.2 4A3 3 0 0 0 7 7m-4 2a3 3 0 0 1 3 3m-3 4a3 3 0 0 0 3-2m1 6a3 3 0 0 1 1-4m9.8-12A3 3 0 0 1 17 7m4 2a3 3 0 0 0-3 3m3 4a3 3 0 0 1-3-2m-1 6a3 3 0 0 0-1-4" />
    </OutlineIcon>
  );
}
