"use client";

import { ComputerDesktopIcon } from "@heroicons/react/24/solid";
import type { ReactNode } from "react";
import { AccentPicker } from "@/components/app/settings/accent-picker";
import { fontFamilies, fontLabels } from "@/components/app/settings/fonts";
import {
  Group,
  Row,
  Section,
  Tiles,
} from "@/components/app/settings/primitives";
import { usePreferences } from "@/components/preferences-provider";
import { useTheme } from "@/components/theme-provider";
import { SegmentedControl } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { accentColor } from "@/lib/accent";
import { customSpec } from "@/lib/customize";
import { looks } from "@/lib/looks";
import type { ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Light and dark as a sliver of page, rail and card, for the theme tiles. */
function ThemeSwatch({ mode }: { mode: "light" | "dark" }) {
  const dark = mode === "dark";
  return (
    <span
      className={cn(
        "flex h-full w-full gap-1.5 p-2",
        dark ? "bg-[#0f0f0f]" : "bg-[#f3f3f3]",
      )}
    >
      <span className="flex w-5 flex-col gap-1 pt-1">
        <span className="h-1.5 rounded-full bg-primary" />
        <span
          className={cn(
            "h-1.5 rounded-full",
            dark ? "bg-white/20" : "bg-black/15",
          )}
        />
        <span
          className={cn(
            "h-1.5 rounded-full",
            dark ? "bg-white/20" : "bg-black/15",
          )}
        />
      </span>
      <span
        className={cn(
          "flex flex-1 flex-col gap-1 rounded-md border p-1.5",
          dark ? "border-white/10 bg-[#171717]" : "border-black/10 bg-white",
        )}
      >
        <span
          className={cn(
            "h-1.5 w-3/4 rounded-full",
            dark ? "bg-white/70" : "bg-black/70",
          )}
        />
        <span
          className={cn(
            "h-1.5 w-1/2 rounded-full",
            dark ? "bg-white/25" : "bg-black/20",
          )}
        />
        <span className="mt-auto h-2.5 w-8 rounded-sm bg-primary" />
      </span>
    </span>
  );
}

const themeOptions: {
  value: ThemePreference;
  label: string;
  preview: ReactNode;
}[] = [
  {
    value: "system",
    label: "System",
    preview: (
      <span className="relative flex size-full">
        <span className="w-1/2 overflow-hidden">
          <span className="block h-full w-[200%]">
            <ThemeSwatch mode="light" />
          </span>
        </span>
        <span className="flex w-1/2 justify-end overflow-hidden">
          <span className="block h-full w-[200%] shrink-0">
            <ThemeSwatch mode="dark" />
          </span>
        </span>
        <ComputerDesktopIcon className="absolute top-1/2 left-1/2 size-5 -translate-1/2 rounded-md bg-card p-0.5 text-foreground" />
      </span>
    ),
  },
  {
    value: "light",
    label: "Light",
    preview: <ThemeSwatch mode="light" />,
  },
  {
    value: "dark",
    label: "Dark",
    preview: <ThemeSwatch mode="dark" />,
  },
];

const radiusPx = { sharp: 3, soft: 7, default: 11, round: 18 } as const;

const patternPreview: Record<string, string> = {
  dots: "radial-gradient(circle at 1px 1px, color-mix(in oklab, var(--foreground) 35%, transparent) 1px, transparent 0) 0 0 / 8px 8px",
  grid: "linear-gradient(to right, color-mix(in oklab, var(--foreground) 22%, transparent) 1px, transparent 1px) 0 0 / 10px 10px, linear-gradient(to bottom, color-mix(in oklab, var(--foreground) 22%, transparent) 1px, transparent 1px) 0 0 / 10px 10px",
  lines:
    "repeating-linear-gradient(135deg, color-mix(in oklab, var(--foreground) 25%, transparent) 0 1px, transparent 1px 7px)",
  none: "none",
};

export function AppearanceSection() {
  const { preferences, update } = usePreferences();
  const { preference: theme, setPreference: setTheme } = useTheme();

  const activeLook = looks.find(
    (look) =>
      look.theme === theme &&
      look.accent === preferences.accent &&
      Object.entries(look.settings).every(
        ([key, value]) =>
          preferences[key as keyof typeof look.settings] === value,
      ),
  );

  return (
    <Section id="appearance" title="Appearance">
      <Group>
        <Row label="Looks" keywords="preset theme style bundle" layout="stack">
          <Tiles
            label="Looks"
            columns={6}
            value={activeLook?.id ?? ""}
            onChange={(id) => {
              const look = looks.find((entry) => entry.id === id);
              if (!look) return;
              setTheme(look.theme);
              update({ accent: look.accent, ...look.settings });
            }}
            options={looks.map((look) => ({
              value: look.id,
              label: look.label,
              preview: (
                <span
                  className="flex size-full items-end gap-1.5 p-2.5"
                  style={{
                    background: look.theme === "dark" ? "#0f0f0f" : "#f5f5f5",
                    color: look.theme === "dark" ? "#f2f2f2" : "#0f0f0f",
                    fontFamily: fontFamilies[look.settings.font],
                  }}
                >
                  <span
                    className="text-[1.375rem] leading-none font-semibold"
                    style={{ color: accentColor(look.accent) }}
                  >
                    Aa
                  </span>
                  <span
                    className="mb-0.5 ml-auto h-4 w-8"
                    style={{
                      background: accentColor(look.accent),
                      borderRadius: radiusPx[look.settings.radius],
                    }}
                  />
                </span>
              ),
            }))}
          />
        </Row>
      </Group>

      <Group title="Colour">
        <Row label="Theme" keywords="dark mode light mode night" layout="stack">
          <Tiles
            label="Theme"
            columns={3}
            value={theme}
            onChange={setTheme}
            options={themeOptions}
          />
        </Row>
        <Row
          label="Accent"
          keywords="color colour brand primary hue custom"
          layout="stack"
        >
          <AccentPicker
            value={preferences.accent}
            onChange={(accent) => update({ accent })}
          />
        </Row>
        <Row label="Surface tint" keywords="background color wash">
          <SegmentedControl
            aria-label="Surface tint"
            tone="neutral"
            value={preferences.tint}
            onValueChange={(tint) => update({ tint })}
            options={[
              { value: "neutral", label: "Neutral" },
              { value: "tinted", label: "Tinted" },
              { value: "vivid", label: "Vivid" },
            ]}
          />
        </Row>
      </Group>

      <Group title="Shape and type">
        <Row
          label="Corners"
          keywords="radius rounded sharp square border"
          layout="stack"
        >
          <Tiles
            label="Corners"
            value={preferences.radius}
            onChange={(radius) => update({ radius })}
            options={customSpec.radius.options.map((radius) => ({
              value: radius,
              label: radius === "default" ? "Default" : capitalise(radius),
              preview: (
                <span
                  className="block h-10 w-16 border-2 border-primary bg-primary/15"
                  style={{ borderRadius: radiusPx[radius] }}
                />
              ),
            }))}
          />
        </Row>
        <Row
          label="Typeface"
          keywords="font family text serif mono dyslexia"
          layout="stack"
        >
          <Tiles
            label="Typeface"
            columns={6}
            value={preferences.font}
            onChange={(font) => update({ font })}
            options={customSpec.font.options.map((font) => ({
              value: font,
              label: fontLabels[font],
              preview: (
                <span
                  className="text-[1.75rem] leading-none font-medium"
                  style={{ fontFamily: fontFamilies[font] }}
                >
                  Aa
                </span>
              ),
            }))}
          />
        </Row>
        <Row
          label="Interface size"
          keywords="zoom text size font size bigger smaller scale"
        >
          <SegmentedControl
            aria-label="Interface size"
            tone="neutral"
            value={preferences.scale}
            onValueChange={(scale) => update({ scale })}
            options={[
              { value: "90", label: <span className="text-[0.75rem]">A</span> },
              {
                value: "100",
                label: <span className="text-[0.875rem]">A</span>,
              },
              { value: "110", label: <span className="text-[1rem]">A</span> },
              {
                value: "120",
                label: <span className="text-[1.125rem]">A</span>,
              },
            ]}
          />
        </Row>
      </Group>

      <Group title="Details">
        <Row
          label="Sidebar backdrop"
          keywords="pattern dots grid lines texture rail"
          layout="stack"
        >
          <Tiles
            label="Sidebar backdrop"
            value={preferences.pattern}
            onChange={(pattern) => update({ pattern })}
            options={customSpec.pattern.options.map((pattern) => ({
              value: pattern,
              label: pattern === "none" ? "None" : capitalise(pattern),
              preview: (
                <span
                  className="size-full"
                  style={{
                    background: patternPreview[pattern],
                    maskImage:
                      "linear-gradient(to top, #000, rgb(0 0 0 / 0.4))",
                  }}
                />
              ),
            }))}
          />
        </Row>
        <Row label="Cursor" keywords="mouse pointer arrow">
          <SegmentedControl
            aria-label="Cursor"
            tone="neutral"
            value={preferences.cursor}
            onValueChange={(cursor) => update({ cursor })}
            options={[
              { value: "custom", label: "Site" },
              { value: "system", label: "System" },
            ]}
          />
        </Row>
        <Row
          label="Animated backgrounds"
          keywords="effects webgl performance battery pixel"
        >
          <Switch
            aria-label="Animated backgrounds"
            checked={preferences.effects}
            onCheckedChange={(effects) => update({ effects })}
          />
        </Row>
      </Group>
    </Section>
  );
}

function capitalise(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
