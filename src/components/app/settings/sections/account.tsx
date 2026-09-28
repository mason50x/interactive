"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowRightStartOnRectangleIcon,
  ArrowUpTrayIcon,
} from "@heroicons/react/24/solid";
import { useRef, useState } from "react";
import { Avatar } from "@/components/app/user-menu/avatar";
import { Group, Row, Section } from "@/components/app/settings/primitives";
import { usePreferences } from "@/components/preferences-provider";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { normalizePersonName } from "@/lib/person-name";
import { defaultPreferences, resolvePreferences } from "@/lib/preferences";
import { themePreferences, type ThemePreference } from "@/lib/theme";

const EXPORT_VERSION = 1;

export function AccountSection() {
  const { user } = useUser();
  const { openUserProfile, signOut } = useClerk();
  const [confirming, setConfirming] = useState(false);

  if (!user) return null;
  const name =
    normalizePersonName(user.fullName) ?? user.username ?? "Your account";

  return (
    <Section id="account" title="Account">
      <Group>
        <Row
          label={name}
          description={user.primaryEmailAddress?.emailAddress}
          keywords="profile email password security devices sessions account manage"
        >
          <div className="flex items-center gap-3">
            <Avatar src={user.imageUrl} name={name} size={40} />
            <Button
              variant="outline"
              size="lg"
              onClick={() => openUserProfile()}
            >
              Manage account
            </Button>
          </div>
        </Row>
        <Row label="Sign out" keywords="log out sign out leave">
          <Button
            variant="destructive"
            size="lg"
            onBlur={() => setConfirming(false)}
            onClick={() => {
              if (!confirming) {
                setConfirming(true);
                return;
              }
              void signOut({ redirectUrl: "/" });
            }}
          >
            <ArrowRightStartOnRectangleIcon />
            {confirming ? "Click again to sign out" : "Sign out"}
          </Button>
        </Row>
      </Group>
    </Section>
  );
}

export function DataSection() {
  const { preferences, update } = usePreferences();
  const { preference: theme, setPreference: setTheme } = useTheme();
  const file = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const download = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          { version: EXPORT_VERSION, theme, preferences },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "settings.json";
    link.click();
    URL.revokeObjectURL(url);
    setStatus("Downloaded settings.json.");
  };

  const upload = async (picked: File | undefined) => {
    if (!picked) return;
    try {
      const parsed: unknown = JSON.parse(await picked.text());
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        !("preferences" in parsed)
      )
        throw new Error("shape");
      const { preferences: incoming, theme: incomingTheme } = parsed as {
        preferences: Record<string, unknown>;
        theme?: unknown;
      };
      // Through the same resolver as a stored row: anything unknown or out
      // of range falls back rather than landing on the page.
      update(resolvePreferences(incoming));
      if (themePreferences.includes(incomingTheme as ThemePreference))
        setTheme(incomingTheme as ThemePreference);
      setStatus("Settings imported.");
    } catch {
      setStatus("That file is not a settings export.");
    } finally {
      if (file.current) file.current.value = "";
    }
  };

  return (
    <Section id="data" title="Your settings">
      <Group>
        <Row label="Export" keywords="backup download save json export">
          <Button variant="outline" size="lg" onClick={download}>
            <ArrowDownTrayIcon />
            Export
          </Button>
        </Row>
        <Row
          label="Import"
          description={status}
          keywords="restore upload load json import"
        >
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void upload(event.target.files?.[0])}
          />
          <Button
            variant="outline"
            size="lg"
            onClick={() => file.current?.click()}
          >
            <ArrowUpTrayIcon />
            Import
          </Button>
        </Row>
        <Row
          label="Reset everything"
          keywords="reset default restore clear factory"
        >
          <Button
            variant="destructive"
            size="lg"
            onBlur={() => setConfirmingReset(false)}
            onClick={() => {
              if (!confirmingReset) {
                setConfirmingReset(true);
                return;
              }
              // `update` leaves an empty lunch alone, so this keeps theirs.
              update({ ...defaultPreferences, lunch: null });
              setTheme("dark");
              setConfirmingReset(false);
              setStatus(null);
            }}
          >
            <ArrowPathIcon />
            {confirmingReset ? "Click again to reset" : "Reset"}
          </Button>
        </Row>
      </Group>
    </Section>
  );
}
