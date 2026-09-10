"use client";

import { useEffect, useRef, useState } from "react";
import { Kbd } from "@/components/ui/kbd";
import { canonicalCombo, comboParts, isRiskyCombo } from "@/lib/preferences";
import { cn } from "@/lib/utils";

/**
 * Press the key you want; the button shows what it heard.
 *
 * Recording rather than picking from a list, because the thing being set is a
 * physical gesture. A dropdown of key names asks you to translate the reach
 * your hand will actually make into a word and then find that word — and it
 * cannot express a modifier at all without becoming three controls.
 *
 * While it is armed it takes every key in the capture phase, which is what
 * lets it record Escape and Tab: those would otherwise close the modal and
 * move focus before this ever saw them.
 */
export function ComboRecorder({
  value,
  onChange,
}: {
  value: string;
  onChange: (combo: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!recording) return;

    function onKeyDown(event: KeyboardEvent) {
      const combo = canonicalCombo(event);
      // A modifier on its own: still waiting for the key it belongs to.
      if (!combo) return;

      event.preventDefault();
      event.stopPropagation();
      setRecording(false);
      onChange(combo);
      buttonRef.current?.focus();
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording, onChange]);

  const risky = isRiskyCombo(value);

  return (
    <div className="max-w-[11rem] text-right">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Panic key shortcut"
        onClick={() => setRecording((previous) => !previous)}
        className={cn(
          "flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[0.875rem] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          recording
            ? "border-ring bg-accent text-accent-foreground"
            : "border-border bg-background hover:bg-muted",
        )}
      >
        {recording ? (
          <span className="text-muted-foreground">Press any key…</span>
        ) : (
          comboParts(value).map((part, index) => (
            <span key={index} className="contents">
              {index > 0 && <span className="text-faint">+</span>}
              <Kbd mono>{part}</Kbd>
            </span>
          ))
        )}
      </button>

      {risky && !recording && (
        <p className="mt-2 text-[0.75rem] leading-relaxed text-destructive">
          A single letter fires while you are typing, too.
        </p>
      )}
    </div>
  );
}
