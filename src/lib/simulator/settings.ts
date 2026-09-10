import { readStoredJson, writeStoredJson } from "@/lib/storage";

/**
 * Device-side simulator settings: the volume and whether the touch controls
 * are drawn. Kept on the device rather than the account because a phone and
 * a laptop want different answers from the same person.
 */
export type Settings = { volume: number; touch: boolean };

export const defaultSettings: Settings = { volume: 0.4, touch: true };

const SETTINGS_KEY = "50x:simulator:settings";

/** Whatever is stored, field by field, with the defaults for anything that is
 *  missing or not the shape we wrote. */
export function readSettings(): Settings {
  const stored = readStoredJson<Partial<Settings>>(SETTINGS_KEY) ?? {};
  return {
    volume:
      typeof stored.volume === "number" && Number.isFinite(stored.volume)
        ? Math.max(0, Math.min(1, stored.volume))
        : defaultSettings.volume,
    touch:
      typeof stored.touch === "boolean" ? stored.touch : defaultSettings.touch,
  };
}

export function saveSettings(value: Settings) {
  writeStoredJson(SETTINGS_KEY, value);
}
