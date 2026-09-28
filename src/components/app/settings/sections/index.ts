import {
  ChatBubbleLeftRightIcon,
  CircleStackIcon,
  ClockIcon,
  EyeIcon,
  HomeIcon,
  ShieldCheckIcon,
  SwatchIcon,
  UserCircleIcon,
  ViewColumnsIcon,
} from "@heroicons/react/24/solid";
import type { ComponentType } from "react";
import {
  AccountSection,
  DataSection,
} from "@/components/app/settings/sections/account";
import { AppearanceSection } from "@/components/app/settings/sections/appearance";
import {
  ChatSection,
  TimeSection,
} from "@/components/app/settings/sections/chat-and-time";
import { HomeSection } from "@/components/app/settings/sections/home";
import { LayoutSection } from "@/components/app/settings/sections/layout";
import {
  AccessibilitySection,
  PrivacySection,
} from "@/components/app/settings/sections/privacy";
import type { Icon } from "@/lib/icons";

/**
 * The Settings tabs, in the order the nav lists them. Each is a page of its
 * own at `/settings/<id>`; search is the one view that shows them together.
 */
export const settingsSections: {
  id: string;
  label: string;
  icon: Icon;
  Component: ComponentType;
}[] = [
  {
    id: "appearance",
    label: "Appearance",
    icon: SwatchIcon,
    Component: AppearanceSection,
  },
  {
    id: "layout",
    label: "Layout",
    icon: ViewColumnsIcon,
    Component: LayoutSection,
  },
  { id: "home", label: "Home", icon: HomeIcon, Component: HomeSection },
  {
    id: "chat",
    label: "Chat",
    icon: ChatBubbleLeftRightIcon,
    Component: ChatSection,
  },
  {
    id: "time",
    label: "Time and school",
    icon: ClockIcon,
    Component: TimeSection,
  },
  {
    id: "privacy",
    label: "Privacy",
    icon: ShieldCheckIcon,
    Component: PrivacySection,
  },
  {
    id: "accessibility",
    label: "Accessibility",
    icon: EyeIcon,
    Component: AccessibilitySection,
  },
  {
    id: "data",
    label: "Your settings",
    icon: CircleStackIcon,
    Component: DataSection,
  },
  {
    id: "account",
    label: "Account",
    icon: UserCircleIcon,
    Component: AccountSection,
  },
];

export const SETTINGS_DEFAULT_SECTION = "appearance";

export function findSettingsSection(id: string) {
  return settingsSections.find((section) => section.id === id);
}
