"use client";

import { useState } from "react";
import { homeSections } from "@/components/app/home/sections";
import { Group, Row, Section } from "@/components/app/settings/primitives";
import { usePreferences } from "@/components/preferences-provider";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { customSpec } from "@/lib/customize";

export function HomeSection() {
  const { preferences, update } = usePreferences();
  // Typed locally and written on blur, so each keystroke is not a save.
  const [nickname, setNickname] = useState(preferences.nickname);
  const [synced, setSynced] = useState(preferences.nickname);
  if (preferences.nickname !== synced) {
    setSynced(preferences.nickname);
    setNickname(preferences.nickname);
  }

  return (
    <Section id="home" title="Home">
      <Group>
        <Row label="What to call you" keywords="nickname name greeting hello">
          <Input
            aria-label="What to call you"
            placeholder="Your first name"
            maxLength={customSpec.nickname.max}
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            onBlur={() => {
              if (nickname.trim() !== preferences.nickname)
                update({ nickname: nickname.trim() });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className="w-52"
          />
        </Row>
      </Group>

      <Group title="Cards on Home">
        {homeSections.map((section) => {
          const shown = !preferences.homeHidden.includes(section.id);
          return (
            <Row
              key={section.id}
              label={section.label}
              keywords="home card widget show hide dashboard"
            >
              <Switch
                aria-label={`Show ${section.label}`}
                checked={shown}
                onCheckedChange={(next) =>
                  update({
                    homeHidden: next
                      ? preferences.homeHidden.filter((id) => id !== section.id)
                      : [...preferences.homeHidden, section.id],
                  })
                }
              />
            </Row>
          );
        })}
      </Group>
    </Section>
  );
}
