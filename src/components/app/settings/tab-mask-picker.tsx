"use client";

import { PresetSelect } from "@/components/app/settings/preset-select";
import { tabMasks, type TabMaskId } from "@/lib/tab-mask";

/**
 * What the tab pretends to be, from the same five logos.
 *
 * The picker is the panic key's list because it is the same question asked at
 * a different moment — where would this tab be unremarkable — and the answer
 * is drawn from the same folder. Someone who has already chosen Google Docs to
 * flee to should recognise this control before reading its label.
 *
 * What the disguise reads as in words is the row's note, in `SettingsPanel`.
 */
export function TabMaskPicker({
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
