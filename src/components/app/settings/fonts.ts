import type { CustomSettings } from "@/lib/customize";

/**
 * Each typeface as a `font-family`, for drawing a tile in the face it names.
 *
 * The same stacks `data-pref-font` points the page at in `globals.css`, but
 * reached through the faces' own variables rather than `--font-ui`: a tile
 * has to show its face whatever the page is currently set in.
 */
export const fontFamilies: Record<CustomSettings["font"], string> = {
  inter: "var(--font-inter), system-ui, sans-serif",
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  readable: "var(--font-readable), system-ui, sans-serif",
  rounded: "var(--font-rounded), ui-rounded, system-ui, sans-serif",
  serif: "var(--font-book-serif), Georgia, serif",
  mono: "var(--font-mono-face), ui-monospace, Menlo, monospace",
};

export const fontLabels: Record<CustomSettings["font"], string> = {
  inter: "Inter",
  system: "System",
  readable: "Hyperlegible",
  rounded: "Rounded",
  serif: "Book serif",
  mono: "Mono",
};
