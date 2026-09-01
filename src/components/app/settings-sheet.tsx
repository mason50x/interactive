"use client";

import { CheckIcon } from "@heroicons/react/24/solid";
import { StopIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePreferences } from "@/components/preferences-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  accents,
  canonicalCombo,
  comboParts,
  isRiskyCombo,
  panicPresets,
  safePanicUrl,
  type AccentId,
} from "@/lib/preferences";
import { tabMaskAssets, tabMasks, type TabMaskId } from "@/lib/tab-mask";
import { cn } from "@/lib/utils";

/**
 * Everything about this site that is a matter of taste, in one panel.
 *
 * A sheet rather than a settings page: none of it is worth losing your place
 * over, and every control here changes the page *behind* the panel — the
 * accent repaints the rail, the constellation stops drifting — which only
 * reads as cause and effect if you can still see it happening.
 *
 * The panel is a list of labelled rows and nothing else. No section headings,
 * no explanatory paragraphs: a control that needs a paragraph to be understood
 * is the wrong control, and a heading over two rows is a title for its own
 * sake. What is left of the prose lives where it is load-bearing — the warning
 * on a risky key — and only appears once it applies.
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
  const mask = tabMaskAssets(preferences.tabMask);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[22rem] max-w-[calc(100vw-1.5rem)] gap-0 overflow-y-auto"
      >
        <SheetHeader className="px-5 pt-5 pb-2">
          <SheetTitle className="text-[1.0625rem]">Settings</SheetTitle>
        </SheetHeader>

        <div className="divide-y divide-border">
          <Row label="Accent">
            <AccentPicker
              value={preferences.accent}
              onChange={(accent) => update({ accent })}
            />
          </Row>

          <Row label="Constellation">
            <Switch
              checked={preferences.constellation}
              onCheckedChange={(constellation) => update({ constellation })}
            />
          </Row>

          <Row
            label="Tab disguise"
            // The half a logo cannot show. The mark is what the tab *looks*
            // like and the title is what it *says*, and only the first of
            // those fits in the control; without this line the text of the
            // disguise would be discovered by glancing up at the tab strip.
            note={mask && `Tabs will read “${mask.title}”.`}
          >
            <TabMaskPicker
              value={preferences.tabMask}
              onChange={(tabMask) => update({ tabMask })}
            />
          </Row>

          <Row label="Panic key">
            <Switch
              checked={preferences.panicEnabled}
              onCheckedChange={(panicEnabled) => update({ panicEnabled })}
            />
          </Row>

          {/* The key and its destination only matter once the key is armed,
              and unmounting them is what keeps this panel short by default. */}
          {preferences.panicEnabled && (
            <>
              <Row label="Key">
                <ComboRecorder
                  value={preferences.panicKey}
                  onChange={(panicKey) => update({ panicKey })}
                />
              </Row>

              <Row label="Escape to">
                <DestinationPicker
                  value={preferences.panicUrl}
                  onChange={(panicUrl) => update({ panicUrl })}
                />
              </Row>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Label on the left, control on the right, and — when there is one — a line of
 * consequence under both.
 *
 * Every control in this panel now fits on the label's line, which is what lets
 * the whole sheet be one shape instead of two. The control column may shrink
 * (`min-w-0`, so a dropdown narrows rather than pushing its label off the
 * edge on a phone-width sheet); the label may not.
 */
function Row({
  label,
  note,
  children,
}: {
  label: string;
  note?: string | null | false;
  children: ReactNode;
}) {
  return (
    <div className="px-5 py-3.5">
      <div className="flex items-center justify-between gap-4">
        <p className="shrink-0 text-[0.875rem] font-medium text-foreground">
          {label}
        </p>
        <div className="flex min-w-0 justify-end">{children}</div>
      </div>
      <RowNote>{note || null}</RowNote>
    </div>
  );
}

/**
 * The line under a row, which grows and collapses rather than appearing.
 *
 * A note that pops in shoves the rest of the panel down a line in a single
 * frame, and in a sheet where every other change is a transition that is the
 * one movement that reads as a glitch. The measurement problem — you cannot
 * transition to `height: auto` — is solved with a collapsed grid row:
 * `0fr` to `1fr` is two numbers CSS will interpolate, and the child clips
 * itself against the track.
 *
 * The text is held through the collapse. Clearing it on the same frame the
 * row starts closing would animate an empty box shut, so the last thing said
 * stays said until the space it occupied is gone.
 */
function RowNote({ children }: { children: string | null }) {
  const [held, setHeld] = useState(children);
  if (children !== null && children !== held) setHeld(children);

  return (
    <div
      aria-hidden={children === null}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        children === null ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]",
      )}
    >
      <div className="overflow-hidden">
        <p className="pt-2 text-[0.75rem] leading-relaxed text-muted-foreground">
          {children ?? held}
        </p>
      </div>
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
              "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-white transition-transform duration-150 outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
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
              <kbd className="rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[0.75rem] text-foreground shadow-[0_1px_0_var(--border)]">
                {part}
              </kbd>
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

/**
 * The blank page first, then five places anyone might plausibly be. Six
 * choices and no free-text field: the worst moment to be composing a URL is
 * the moment you are setting up for, and an address bar in here is a way to
 * arrive at a typo under the one keystroke that has to work.
 *
 * The list is `PresetSelect`, shared with the tab disguise below.
 *
 * `panicUrl` still holds a full address and `safePanicUrl` still guards it —
 * the row is written by `convex/preferences.ts` too, and a value that got in
 * before this list existed has to keep working. Such a value matches no
 * option, so it is shown as itself in the closed control rather than being
 * quietly reported as one of ours.
 */
function DestinationPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  // Compared normalised, not literally. The stored value has been through
  // `new URL()` on both sides of the wire, so a preset is matched by where it
  // points rather than by how it was typed.
  const selected = panicPresets.find(
    (preset) => safePanicUrl(preset.url) === safePanicUrl(value),
  );

  return (
    <PresetSelect
      label="Panic key destination"
      value={selected?.url ?? null}
      placeholder={value}
      options={panicPresets.map((preset) => ({
        value: preset.url,
        label: preset.label,
        icon: "icon" in preset ? preset.icon : undefined,
      }))}
      onChange={onChange}
    />
  );
}

/**
 * What the tab pretends to be, from the same five logos.
 *
 * The picker is the panic key's list because it is the same question asked at
 * a different moment — where would this tab be unremarkable — and the answer
 * is drawn from the same folder. Someone who has already chosen Google Docs to
 * flee to should recognise this control before reading its label.
 *
 * What the disguise reads as in words is the row's note, in `SettingsSheet`.
 */
function TabMaskPicker({
  value,
  onChange,
}: {
  value: TabMaskId;
  onChange: (mask: TabMaskId) => void;
}) {
  return (
    <PresetSelect
      label="Tab disguise"
      value={value}
      options={tabMasks.map((mask) => ({
        value: mask.id,
        label: mask.label,
        icon: "icon" in mask ? mask.icon : undefined,
      }))}
      onChange={(next) => onChange(next as TabMaskId)}
    />
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One row that opens into six, shared by the two controls that are a choice
 * between the same handful of sites.
 *
 * A dropdown rather than the grid of tiles this used to be. The grid showed
 * all six at once, which sounds like the better trade until you count what it
 * cost: three rows of tiles under each of two labels, in a sheet whose other
 * four controls are single lines, so arming the panic key doubled the panel's
 * height and the two rarest settings were the two loudest things in it. A
 * closed row states the current answer — which is the only part that is true
 * at rest — and the six live one click behind it.
 *
 * The mark survives the change, in both places. These are not names being
 * read; they are the tab you are hoping to land on, or the tab you are hoping
 * to be mistaken for, and the mark is what that tab looks like in the strip
 * along the top. It sits at favicon size, which is the size it will be seen
 * at for real.
 */
function PresetSelect({
  label,
  value,
  placeholder,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  placeholder?: string;
  options: { value: string; label: string; icon?: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        // The list is single-select and every option carries a string, so the
        // array and null arms of Base UI's signature are unreachable here.
        if (typeof next === "string") onChange(next);
      }}
    >
      <SelectTrigger aria-label={label} className="w-[11.5rem] max-w-full">
        <SelectValue className="flex min-w-0 items-center gap-2">
          {(current: string | null) => {
            const option = options.find((entry) => entry.value === current);

            return option ? (
              <>
                <PresetMark icon={option.icon} />
                <span className="truncate">{option.label}</span>
              </>
            ) : (
              // A destination that predates this list: shown as the address it
              // actually is, so nobody reads the control as saying "Gmail"
              // when the key would take them somewhere else.
              <span className="truncate text-muted-foreground">
                {placeholder}
              </span>
            );
          }}
        </SelectValue>
      </SelectTrigger>

      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <PresetMark icon={option.icon} />
            <span className="truncate">{option.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * A site's favicon, or the absence of one.
 *
 * No plate behind the mark: every icon in `public/brand/escape` is transparent
 * and light enough to read on the popup itself, in either theme, so the logo
 * sits on the panel rather than on a white sticker stuck to it. A site whose
 * mark cannot do that does not belong in this list.
 */
function PresetMark({ icon }: { icon?: string }) {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center">
      {icon ? (
        // Not `next/image`: a 64px favicon served from `public/` has nothing
        // left to optimise, and the loader would put a request in front of
        // five files worth 5 kB together.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={icon}
          alt=""
          width={16}
          height={16}
          className="size-full object-contain"
        />
      ) : (
        <StopIcon className="size-4 text-faint" />
      )}
    </span>
  );
}
