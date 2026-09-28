"use client";

import { previewBell } from "@/components/app/bell-toast";
import { useChat } from "@/components/app/chat/chat-provider";
import { Group, Row, Section } from "@/components/app/settings/primitives";
import { usePreferences } from "@/components/preferences-provider";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { SegmentedControl } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import type { LunchNumber } from "@/lib/school-schedule";

export function ChatSection() {
  const { preferences, update } = usePreferences();
  const { notifications } = useChat();

  return (
    <Section id="chat" title="Chat">
      <Group>
        <Row
          label="Enter sends"
          description={
            preferences.enterToSend ? (
              <>
                <Kbd>Enter</Kbd> sends, <Kbd>Shift</Kbd> + <Kbd>Enter</Kbd>{" "}
                starts a new line.
              </>
            ) : (
              <>
                <Kbd>Enter</Kbd> starts a new line, <Kbd>Ctrl</Kbd> +{" "}
                <Kbd>Enter</Kbd> sends.
              </>
            )
          }
          keywords="enter send keyboard new line composer shift"
        >
          <Switch
            aria-label="Enter sends"
            checked={preferences.enterToSend}
            onCheckedChange={(enterToSend) => update({ enterToSend })}
          />
        </Row>
        <Row
          label="Desktop notifications"
          description={
            notifications.error ??
            (notifications.permission === "denied"
              ? "Blocked in your browser's site settings."
              : null)
          }
          keywords="notify alert popup bell sound messages"
        >
          <Switch
            aria-label="Desktop notifications"
            checked={notifications.enabled}
            disabled={
              notifications.pending ||
              notifications.permission === "unsupported"
            }
            onCheckedChange={() => void notifications.toggle()}
          />
        </Row>
      </Group>
    </Section>
  );
}

export function TimeSection() {
  const { preferences, update } = usePreferences();

  return (
    <Section id="time" title="Time and school">
      <Group>
        <Row label="Lunch" keywords="lunch period block schedule bell">
          <SegmentedControl
            aria-label="Lunch"
            tone="neutral"
            value={String(preferences.lunch ?? "")}
            onValueChange={(lunch) =>
              update({ lunch: Number(lunch) as LunchNumber })
            }
            options={[
              { value: "1", label: "First" },
              { value: "2", label: "Second" },
              { value: "3", label: "Third" },
            ]}
          />
        </Row>
        <Row label="24-hour clock" keywords="clock time format military am pm">
          <Switch
            aria-label="24-hour clock"
            checked={preferences.clock24}
            onCheckedChange={(clock24) => update({ clock24 })}
          />
        </Row>
      </Group>
      <Group>
        <Row
          label="Bell countdown"
          description="A countdown in the corner before the bell rings."
          keywords="bell toast countdown timer class ends minutes left notification"
        >
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={previewBell}>
              Preview
            </Button>
            <Switch
              aria-label="Bell countdown"
              checked={preferences.bellCountdown}
              onCheckedChange={(bellCountdown) => update({ bellCountdown })}
            />
          </div>
        </Row>
        {preferences.bellCountdown && (
          <>
            <Row
              label="Show it"
              keywords="bell countdown lead minutes before warning early"
            >
              <SegmentedControl
                aria-label="Minutes before the bell"
                tone="neutral"
                value={preferences.bellLead}
                onValueChange={(bellLead) =>
                  update({ bellLead: bellLead as typeof preferences.bellLead })
                }
                options={[
                  { value: "1", label: "1 min" },
                  { value: "2", label: "2 min" },
                  { value: "5", label: "5 min" },
                  { value: "10", label: "10 min" },
                  { value: "15", label: "15 min" },
                ]}
              />
            </Row>
            <Row
              label="Count down to"
              keywords="bell countdown class lunch passing end of day which bells"
            >
              <SegmentedControl
                aria-label="Which bells"
                tone="neutral"
                value={preferences.bellFor}
                onValueChange={(bellFor) =>
                  update({ bellFor: bellFor as typeof preferences.bellFor })
                }
                options={[
                  { value: "every", label: "Every bell" },
                  { value: "class", label: "End of class" },
                  { value: "day", label: "End of day" },
                ]}
              />
            </Row>
            <Row
              label="Chime"
              description="A soft bell sound when the countdown hits zero."
              keywords="bell sound audio chime ring"
            >
              <Switch
                aria-label="Chime"
                checked={preferences.bellChime}
                onCheckedChange={(bellChime) => update({ bellChime })}
              />
            </Row>
          </>
        )}
      </Group>
    </Section>
  );
}
