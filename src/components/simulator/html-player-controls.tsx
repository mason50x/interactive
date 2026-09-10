"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowsPointingOutIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { ChevronRightIcon } from "@heroicons/react/24/solid";
import { Button, ButtonLink } from "@/components/ui/button";
import styles from "./html-player.module.css";

/**
 * The strip of controls floating over the top-left of the frame.
 *
 * Imported HTML owns the whole viewport, so the player's own chrome is
 * kept to one dim button that unfolds into the row — back, the name,
 * reload, fullscreen — and folds away again on Escape. The two notices
 * under it are the only place the player can say anything at all while a
 * page is running: a save that failed is shown whenever it happens, while
 * the softer note about account metadata waits until the row is open.
 */
export function HtmlPlayerControls({
  label,
  back,
  fullscreen,
  reload,
  toggleFullscreen,
  saveError,
  metadataError,
}: {
  label: string;
  back: string;
  fullscreen: boolean;
  reload: () => void;
  toggleFullscreen: () => void;
  saveError: string;
  metadataError: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  return (
    <div className="absolute top-3 left-3 z-10 max-w-[calc(100%-1.5rem)]">
      <div className={styles.controls} data-open={open}>
        <button
          type="button"
          aria-label={open ? "Hide player controls" : "Show player controls"}
          aria-expanded={open}
          aria-controls="html-player-controls"
          className={styles.toggle}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronRightIcon
            className="size-4 transition-transform duration-300 motion-reduce:transition-none"
            style={{ transform: open ? "rotate(180deg)" : undefined }}
          />
        </button>
        <div id="html-player-controls" className={styles.actions} inert={!open}>
          <ButtonLink
            href={back}
            variant="ghost"
            aria-label="Back to HTML library"
            className={styles.action}
          >
            <ArrowLeftIcon className="size-4" />
          </ButtonLink>
          <span className="min-w-0 flex-1 truncate px-1 text-xs font-medium">
            {label}
          </span>
          <Button
            variant="ghost"
            aria-label="Reload HTML from saved progress"
            onClick={reload}
            className={styles.action}
          >
            <ArrowPathIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            onClick={toggleFullscreen}
            className={styles.action}
          >
            {fullscreen ? (
              <XMarkIcon className="size-4" />
            ) : (
              <ArrowsPointingOutIcon className="size-4" />
            )}
          </Button>
        </div>
      </div>
      {saveError && (
        <p
          role="alert"
          className="mt-2 max-w-72 rounded-lg bg-zinc-950/90 px-3 py-2 text-xs text-white"
        >
          {saveError}
        </p>
      )}
      {open && metadataError && (
        <p className="mt-2 max-w-72 rounded-lg bg-zinc-950/90 px-3 py-2 text-xs text-white">
          {metadataError}
        </p>
      )}
    </div>
  );
}
