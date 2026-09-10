/**
 * `cn` merges class lists the way a call site expects: conditionals through
 * `clsx`, and conflicting Tailwind utilities settled by `tailwind-merge` so
 * the last one wins rather than whichever the stylesheet emitted later.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
