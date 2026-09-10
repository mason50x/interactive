"use client";

import { PresetSelect } from "@/components/app/settings/preset-select";
import { panicPresets, safePanicUrl } from "@/lib/preferences";

/**
 * The blank page first, then five places anyone might plausibly be. Six
 * choices and no free-text field: the worst moment to be composing a URL is
 * the moment you are setting up for, and an address bar in here is a way to
 * arrive at a typo under the one keystroke that has to work.
 *
 * The list is `PresetSelect`, shared with the tab disguise.
 *
 * `panicUrl` still holds a full address and `safePanicUrl` still guards it —
 * the row is written by `convex/preferences.ts` too, and a value that got in
 * before this list existed has to keep working. Such a value matches no
 * option, so it is shown as itself in the closed control rather than being
 * quietly reported as one of ours.
 */
export function DestinationPicker({
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
