"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import styles from "./reveal.module.css";

/**
 * A region that opens and closes with its own height animated.
 *
 * Three places on the simulator pages hide a block of controls behind a
 * toggle — the paste-code editor in the HTML library, and the two sections
 * under the Game Boy's session card — and they all want the same motion: the
 * block grows out of nothing rather than popping in. This is that motion in
 * one place. `data-open` drives the CSS, and `inert` keeps the closed block
 * out of the tab order and the accessibility tree, since a region that is
 * visually gone must not still take focus.
 *
 * `contentClassName` is for the caller that needs to restyle what sits
 * inside the clipped row — the session card strips the border off the saves
 * panel it holds, for instance — without giving up the clip itself.
 */
export function Reveal({
  open,
  className,
  contentClassName,
  children,
  ...props
}: ComponentProps<"div"> & { open: boolean; contentClassName?: string }) {
  return (
    <div
      className={cn(styles.reveal, className)}
      data-open={open}
      inert={!open}
      {...props}
    >
      <div className={cn(styles.content, contentClassName)}>{children}</div>
    </div>
  );
}
