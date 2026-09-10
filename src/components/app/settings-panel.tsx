"use client";

import { AccentPicker } from "@/components/app/settings/accent-picker";
import { ComboRecorder } from "@/components/app/settings/combo-recorder";
import { DestinationPicker } from "@/components/app/settings/destination-picker";
import { Row } from "@/components/app/settings/row";
import { TabMaskPicker } from "@/components/app/settings/tab-mask-picker";
import { usePreferences } from "@/components/preferences-provider";
import { Switch } from "@/components/ui/switch";
import { tabMaskAssets } from "@/lib/tab-mask";

/**
 * Everything about this site that is a matter of taste, in one page.
 *
 * The page is Clerk's: this is the first entry in the account modal, ahead of
 * the Account and Security pages Clerk draws itself, and it is portalled into
 * the slot Clerk hands over for a custom page. See `useAccountModal`, which
 * owns the slot; this component owns nothing but the rows.
 *
 * It used to be a sheet of its own, beside the account modal rather than
 * inside it, on the argument that every control here changes the page
 * *behind* the panel — the accent repaints the rail, the constellation stops
 * drifting — and a modal hides that. The argument lost to the one it was up
 * against: two doors in the same menu, "Account" and "Settings", for what
 * anyone else would call one thing. The controls still write as they are
 * touched, and the rail is still visible past the modal's edge.
 *
 * The page is a list of labelled rows and nothing else. No section headings,
 * no explanatory paragraphs: a control that needs a paragraph to be understood
 * is the wrong control, and a heading over two rows is a title for its own
 * sake. What is left of the prose lives where it is load-bearing — the warning
 * on a risky key — and only appears once it applies.
 *
 * Nothing saves. Every control writes as it is touched, through the
 * subscription in `PreferencesProvider`, so there is no Save button to leave
 * unpressed and no state in here that could disagree with the row.
 *
 * The rows and the controls in them live under `settings/`, one file each;
 * this is the list, and the list is the whole of what this page is.
 */
export function SettingsPanel() {
  const { preferences, update } = usePreferences();
  const mask = tabMaskAssets(preferences.tabMask);

  return (
    <div className="text-foreground">
      {/* The same header Clerk puts on its own pages — a title and a line
          under it — so this page reads as a sibling of Account and Security
          rather than a foreign panel that has been let in. Clerk draws nothing
          above a custom page's content; this is the page drawing it itself. */}
      <div className="border-b border-border pb-4">
        <h1 className="text-[1.0625rem] leading-6 font-bold">Settings</h1>
        <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
          How the site looks and behaves for you.
        </p>
      </div>

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
            and unmounting them is what keeps this page short by default. */}
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
    </div>
  );
}
