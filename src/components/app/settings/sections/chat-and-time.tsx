"use client";

import { useChat } from "@/components/app/chat/chat-provider";
import { Group, Row, Section } from "@/components/app/settings/primitives";
import { usePreferences } from "@/components/preferences-provider";
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
    </Section>
  );
}
