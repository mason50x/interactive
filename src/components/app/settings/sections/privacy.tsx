"use client";

import { ComboRecorder } from "@/components/app/settings/combo-recorder";
import { DestinationPicker } from "@/components/app/settings/destination-picker";
import { Group, Row, Section } from "@/components/app/settings/primitives";
import { TabMaskPicker } from "@/components/app/settings/tab-mask-picker";
import { usePreferences } from "@/components/preferences-provider";
import { SegmentedControl } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { NO_TAB_MASK, tabMaskAssets } from "@/lib/tab-mask";

export function PrivacySection() {
  const { preferences, update } = usePreferences();
  const mask = tabMaskAssets(preferences.tabMask);

  return (
    <Section id="privacy" title="Privacy">
      <Group title="Tab disguise">
        <Row
          label="Disguise the tab as"
          description={mask ? `Tabs will read “${mask.title}”.` : null}
          keywords="tab mask cloak title favicon hide disguise"
        >
          <TabMaskPicker
            value={preferences.tabMask}
            onChange={(tabMask) => update({ tabMask })}
          />
        </Row>
        {preferences.tabMask !== NO_TAB_MASK && (
          <Row label="When" keywords="tab mask away blur switch cloak">
            <SegmentedControl
              aria-label="When to disguise the tab"
              tone="neutral"
              value={preferences.maskWhen}
              onValueChange={(maskWhen) => update({ maskWhen })}
              options={[
                { value: "always", label: "Always" },
                { value: "away", label: "When away" },
              ]}
            />
          </Row>
        )}
        <Row
          label="Blur when away"
          keywords="privacy screen blur hide focus shoulder"
        >
          <Switch
            aria-label="Blur when away"
            checked={preferences.privacyBlur}
            onCheckedChange={(privacyBlur) => update({ privacyBlur })}
          />
        </Row>
      </Group>

      <Group title="Panic key">
        <Row
          label="Panic key"
          keywords="panic boss key escape emergency hide quick exit"
        >
          <Switch
            aria-label="Panic key"
            checked={preferences.panicEnabled}
            onCheckedChange={(panicEnabled) => update({ panicEnabled })}
          />
        </Row>
        {preferences.panicEnabled && (
          <>
            <Row label="Key" keywords="panic shortcut hotkey keyboard combo">
              <ComboRecorder
                value={preferences.panicKey}
                onChange={(panicKey) => update({ panicKey })}
              />
            </Row>
            <Row label="Escape to" keywords="panic destination url site">
              <DestinationPicker
                value={preferences.panicUrl}
                onChange={(panicUrl) => update({ panicUrl })}
              />
            </Row>
          </>
        )}
        <Row
          label="Ask before closing"
          keywords="confirm leave close tab unload warning accidental"
        >
          <Switch
            aria-label="Ask before closing"
            checked={preferences.confirmLeave}
            onCheckedChange={(confirmLeave) => update({ confirmLeave })}
          />
        </Row>
      </Group>
    </Section>
  );
}

export function AccessibilitySection() {
  const { preferences, update } = usePreferences();

  return (
    <Section id="accessibility" title="Accessibility">
      <Group>
        <Row
          label="High contrast"
          keywords="contrast vision visibility borders"
        >
          <Switch
            aria-label="High contrast"
            checked={preferences.contrast === "high"}
            onCheckedChange={(on) =>
              update({ contrast: on ? "high" : "standard" })
            }
          />
        </Row>
        <Row
          label="Reduce motion"
          keywords="animation motion vestibular transitions calm"
        >
          <Switch
            aria-label="Reduce motion"
            checked={preferences.motion === "reduce"}
            onCheckedChange={(on) =>
              update({ motion: on ? "reduce" : "system" })
            }
          />
        </Row>
        <Row
          label="Hyperlegible typeface"
          keywords="dyslexia font readable legible reading"
        >
          <Switch
            aria-label="Hyperlegible typeface"
            checked={preferences.font === "readable"}
            onCheckedChange={(on) =>
              update({ font: on ? "readable" : "inter" })
            }
          />
        </Row>
        <Row label="Underline links" keywords="links underline colour blind">
          <Switch
            aria-label="Underline links"
            checked={preferences.underline}
            onCheckedChange={(underline) => update({ underline })}
          />
        </Row>
        <Row
          label="Larger interface"
          keywords="zoom big text size scale vision"
        >
          <Switch
            aria-label="Larger interface"
            checked={preferences.scale === "110" || preferences.scale === "120"}
            onCheckedChange={(on) => update({ scale: on ? "110" : "100" })}
          />
        </Row>
      </Group>
    </Section>
  );
}
