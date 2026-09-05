export type Settings = { volume: number; touch: boolean };
export const defaultSettings: Settings = { volume: 0.4, touch: true };
export function readSettings(): Settings {
  try {
    const v = JSON.parse(
      localStorage.getItem("50x:simulator:settings") ?? "{}",
    );
    return {
      volume:
        typeof v.volume === "number" && Number.isFinite(v.volume)
          ? Math.max(0, Math.min(1, v.volume))
          : 0.4,
      touch: typeof v.touch === "boolean" ? v.touch : true,
    };
  } catch {
    return defaultSettings;
  }
}
export function saveSettings(value: Settings) {
  try {
    localStorage.setItem("50x:simulator:settings", JSON.stringify(value));
  } catch {
    /* Device settings are optional. */
  }
}
