"use client";

import { CheckIcon } from "@heroicons/react/24/solid";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePreferences } from "@/components/preferences-provider";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  accents,
  BLANK_PAGE,
  canonicalCombo,
  comboParts,
  isRiskyCombo,
  panicPresets,
  safePanicUrl,
  type AccentId,
} from "@/lib/preferences";
import { cn } from "@/lib/utils";

/**
 * Everything about this site that is a matter of taste, in one panel.
 *
 * A sheet rather than a settings page: none of it is worth losing your place
 * over, and every control here changes the page *behind* the panel — the
 * accent repaints the rail, the constellation stops drifting — which only
 * reads as cause and effect if you can still see it happening. A page would
 * have made each of these a thing you change somewhere else and then go and
 * check.
 *
 * Nothing saves. Every control writes as it is touched, through the
 * subscription in `PreferencesProvider`, so there is no Save button to leave
 * unpressed and no state in here that could disagree with the row.
 */
export function SettingsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { preferences, update } = usePreferences();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[24rem] max-w-[calc(100vw-1.5rem)] gap-0 overflow-y-auto"
      >
        <SheetHeader className="p-5 pb-4">
          <SheetTitle className="text-[1.0625rem]">Settings</SheetTitle>
          <SheetDescription className="text-[0.875rem]">
            Yours, not this browser&rsquo;s — these follow you to any device you
            sign in on.
          </SheetDescription>
        </SheetHeader>

        <Section title="Appearance">
          <Row
            label="Accent"
            hint="Used for buttons, links, and anything selected."
          >
            <AccentPicker
              value={preferences.accent}
              onChange={(accent) => update({ accent })}
            />
          </Row>

          <Row
            label="Constellation"
            hint="The drifting web behind the sidebar."
          >
            <Switch
              checked={preferences.constellation}
              onCheckedChange={(constellation) => update({ constellation })}
            />
          </Row>
        </Section>

        <Section
          title="Panic key"
          description="One keystroke and this tab becomes something else. It replaces the page rather than opening a new one, so Back does not bring it home."
        >
          <Row label="Enabled" hint="Off until you have set a key you trust.">
            <Switch
              checked={preferences.panicEnabled}
              onCheckedChange={(panicEnabled) => update({ panicEnabled })}
            />
          </Row>

          <div className="px-5 py-3.5">
            <p className="text-[0.875rem] font-medium text-foreground">Key</p>
            <ComboRecorder
              value={preferences.panicKey}
              onChange={(panicKey) => update({ panicKey })}
            />
          </div>

          <div className="px-5 pt-1 pb-5">
            <p className="text-[0.875rem] font-medium text-foreground">
              Escape to
            </p>
            <DestinationPicker
              value={preferences.panicUrl}
              onChange={(panicUrl) => update({ panicUrl })}
            />
          </div>
        </Section>
      </SheetContent>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border">
      <div className="px-5 pt-4 pb-1">
        <h3 className="text-[0.8125rem] font-medium text-muted-foreground">
          {title}
        </h3>
        {description && (
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-faint">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

/** Label on the left, control on the right, hint under the label. */
function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <div className="min-w-0">
        <p className="text-[0.875rem] font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-[0.8125rem] text-faint">{hint}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/**
 * The colours themselves, at the size they will be seen at.
 *
 * A swatch is the control and the preview at once — a dropdown listing the
 * word "Violet" would be asking someone to imagine the thing they are choosing
 * while it sits one click away.
 */
function AccentPicker({
  value,
  onChange,
}: {
  value: AccentId;
  onChange: (accent: AccentId) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Accent colour" className="flex gap-1">
      {accents.map((accent) => {
        const checked = accent.id === value;

        return (
          <button
            key={accent.id}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={accent.label}
            onClick={() => onChange(accent.id)}
            style={{ backgroundColor: accent.color }}
            className={cn(
              "flex size-6 cursor-pointer items-center justify-center rounded-full text-white transition-transform duration-150 outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
              checked && "scale-110",
            )}
          >
            {checked && <CheckIcon className="size-3.5" />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Press the key you want; the button shows what it heard.
 *
 * Recording rather than picking from a list, because the thing being set is a
 * physical gesture. A dropdown of key names asks you to translate the reach
 * your hand will actually make into a word and then find that word — and it
 * cannot express a modifier at all without becoming three controls.
 *
 * While it is armed it takes every key in the capture phase, which is what
 * lets it record Escape and Tab: those would otherwise close the sheet and
 * move focus before this ever saw them.
 */
function ComboRecorder({
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
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setRecording((previous) => !previous)}
        className={cn(
          "mt-2 flex h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border text-[0.875rem] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
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
              <kbd className="rounded-md border border-border bg-surface px-2 py-1 font-mono text-[0.75rem] text-foreground shadow-[0_1px_0_var(--border)]">
                {part}
              </kbd>
            </span>
          ))
        )}
      </button>

      {risky && !recording && (
        <p className="mt-2 text-[0.75rem] leading-relaxed text-destructive">
          A single letter fires while you are typing, too — the key is not
          ignored inside a search box, because a panic key that waits its turn
          is not one.
        </p>
      )}
    </>
  );
}

/**
 * The blank page first, then six places anyone might plausibly be, then a
 * field for the one nobody guessed. The presets exist because the worst moment
 * to be composing a URL is the moment you are setting up for.
 *
 * The note under them is the whole argument for the default: `about:blank` is
 * the only choice that does not have to be fetched, which is what makes it
 * both the fast one and the quiet one. The others are there because speed is
 * not always what is being asked for.
 */
function DestinationPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);

  // The row is the source of truth: a preset clicked above, or a change made
  // in another tab, has to land in the field rather than sit behind it.
  // Adjusted during render rather than in an effect — React re-runs this
  // component before the browser paints, so the field never shows the old
  // address for a frame the way an effect would let it.
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }

  const parsed = safePanicUrl(draft);
  const dirty = draft.trim() !== value;
  const blank = safePanicUrl(value) === BLANK_PAGE;

  function commit() {
    if (parsed && dirty) onChange(parsed);
    else if (!parsed) setDraft(value);
  }

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {panicPresets.map((preset) => {
          // Compared normalised, not literally. The stored value has been
          // through `new URL()` on both sides of the wire, so a preset is
          // matched by where it points rather than by how it was typed.
          const active = safePanicUrl(preset.url) === safePanicUrl(value);

          return (
            <button
              key={preset.url}
              type="button"
              onClick={() => onChange(preset.url)}
              className={cn(
                "cursor-pointer rounded-full border px-2.5 py-1 text-[0.75rem] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                active
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex gap-2">
        <input
          type="url"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
          aria-label="Panic key destination"
          placeholder="https:// or about:blank"
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[0.875rem] transition-[border-color,box-shadow] outline-none placeholder:text-faint focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button
          type="button"
          size="lg"
          disabled={!parsed || !dirty}
          onClick={commit}
          className="shadow-none hover:shadow-none"
        >
          Set
        </Button>
      </div>

      {draft.trim() !== "" && !parsed && (
        <p className="mt-2 text-[0.75rem] text-destructive">
          That needs to be a full web address starting with https://, or
          about:blank.
        </p>
      )}

      {blank && (
        <p className="mt-2.5 text-[0.75rem] leading-relaxed text-muted-foreground">
          The blank page is instant, and the most secure of these. The browser
          already has it, so it arrives in the same moment as the key rather
          than after a page load — and because nothing is fetched, it leaves no
          request, no history entry and no cached page behind. Every other
          destination has to load, which costs both a pause and a trail: pick
          one of those only if you would rather the tab look like something.
        </p>
      )}
    </>
  );
}
