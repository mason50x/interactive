/**
 * The long tail of settings: everything the Settings page can change beyond
 * the handful of original columns on the preferences row.
 *
 * They travel together as one `custom` record on that row rather than a column
 * each, because there are dozens of them and they are all the same kind of
 * thing — a small value the client resolves against the table below and falls
 * back on when it does not recognise it. A setting added here is a line in
 * this table and nothing on the server, and a setting removed from here is a
 * key the next resolve quietly drops.
 *
 * The table is the whole of the vocabulary. Each entry says what shape the
 * value is and what it is when nothing was stored, and `resolveCustom` is the
 * only way a stored record becomes something the page reads.
 */

type Choice<Value extends string> = {
  kind: "choice";
  options: readonly Value[];
  fallback: Value;
};
type Flag = { kind: "flag"; fallback: boolean };
type Text = { kind: "text"; max: number; fallback: string };
type List = { kind: "list"; max: number; fallback: readonly string[] };

const choice = <Value extends string>(
  options: readonly Value[],
  fallback: Value,
): Choice<Value> => ({ kind: "choice", options, fallback });
const flag = (fallback: boolean): Flag => ({ kind: "flag", fallback });
const text = (max: number): Text => ({ kind: "text", max, fallback: "" });
const list = (max: number): List => ({ kind: "list", max, fallback: [] });

export const customSpec = {
  /* Appearance */
  radius: choice(["sharp", "soft", "default", "round"], "default"),
  scale: choice(["90", "100", "110", "120"], "100"),
  font: choice(
    ["inter", "system", "readable", "rounded", "serif", "mono"],
    "inter",
  ),
  tint: choice(["neutral", "tinted", "vivid"], "neutral"),
  pattern: choice(["dots", "grid", "lines", "none"], "dots"),
  effects: flag(true),
  cursor: choice(["custom", "system"], "custom"),

  /* Layout */
  rail: choice(["auto", "icons"], "auto"),
  frame: choice(["framed", "floating", "flush"], "framed"),
  width: choice(["contained", "full"], "contained"),
  navHidden: list(16),
  navOrder: list(16),
  landing: choice(
    ["/home", "/activities", "/tv", "/chat", "/browse", "/leaderboard"],
    "/home",
  ),

  /* Home */
  homeHidden: list(8),
  nickname: text(24),

  /* Chat */
  enterToSend: flag(true),

  /* Time */
  clock24: flag(false),
  bellCountdown: flag(true),
  /** Minutes before a bell that its countdown appears. */
  bellLead: choice(["1", "2", "5", "10", "15"], "5"),
  /** Which bells get one: all of them, the end of each class, or the day's last. */
  bellFor: choice(["every", "class", "day"], "every"),
  bellChime: flag(false),

  /* Privacy */
  maskWhen: choice(["always", "away"], "always"),
  privacyBlur: flag(false),
  confirmLeave: flag(false),

  /* Accessibility */
  contrast: choice(["standard", "high"], "standard"),
  motion: choice(["system", "reduce"], "system"),
  underline: flag(false),
} as const;

type Spec = typeof customSpec;
export type CustomKey = keyof Spec;

type ValueOf<Entry> =
  Entry extends Choice<infer Value>
    ? Value
    : Entry extends Flag
      ? boolean
      : Entry extends Text
        ? string
        : string[];

export type CustomSettings = {
  -readonly [Key in CustomKey]: ValueOf<Spec[Key]>;
};

export const customKeys = Object.keys(customSpec) as CustomKey[];

export function isCustomKey(key: string): key is CustomKey {
  return key in customSpec;
}

export const customDefaults = Object.fromEntries(
  customKeys.map((key) => {
    const fallback = customSpec[key].fallback;
    return [key, Array.isArray(fallback) ? [...fallback] : fallback];
  }),
) as CustomSettings;

/** One stored value against its entry: the value if it fits, else the fallback. */
function resolveValue(key: CustomKey, value: unknown) {
  const entry = customSpec[key];
  switch (entry.kind) {
    case "choice":
      return (entry.options as readonly unknown[]).includes(value)
        ? value
        : entry.fallback;
    case "flag":
      return typeof value === "boolean" ? value : entry.fallback;
    case "text":
      return typeof value === "string"
        ? value.trim().slice(0, entry.max)
        : entry.fallback;
    case "list":
      return Array.isArray(value)
        ? value
            .filter((item): item is string => typeof item === "string")
            .slice(0, entry.max)
        : [...entry.fallback];
  }
}

/** Any record — stored, cached, imported — filled in and checked. */
export function resolveCustom(
  record: Record<string, unknown> | null | undefined,
): CustomSettings {
  const source = record ?? {};
  return Object.fromEntries(
    customKeys.map((key) => [key, resolveValue(key, source[key])]),
  ) as CustomSettings;
}

/**
 * The settings that are painted rather than read: each becomes a
 * `data-pref-*` attribute on `<html>`, and `globals.css` does the rest.
 *
 * Only a value that differs from the default is written, so a browser that
 * never changed anything carries no attributes at all and the stylesheet's
 * own answer stands. `preferencesScript` applies the same list before the
 * first paint; `applyDocumentSettings` keeps it in step afterwards.
 */
export const documentKeys = [
  "radius",
  "scale",
  "font",
  "tint",
  "pattern",
  "effects",
  "cursor",
  "rail",
  "frame",
  "width",
  "contrast",
  "motion",
  "underline",
] as const satisfies readonly CustomKey[];

export function applyDocumentSettings(settings: CustomSettings): void {
  const root = document.documentElement;
  for (const key of documentKeys) {
    const name = `data-pref-${key}`;
    const value = settings[key];
    if (value === customDefaults[key]) root.removeAttribute(name);
    else root.setAttribute(name, String(value));
  }
}
