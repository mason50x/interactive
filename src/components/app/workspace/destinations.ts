import {
  Cog6ToothIcon,
  GlobeAltIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/solid";
import type { ComponentType, SVGProps } from "react";
import { navItems, SETTINGS_HREF } from "@/lib/nav";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export type Destination = {
  href: string;
  label: string;
  icon: Icon;
};

export const destinations: Destination[] = navItems.map((item) => ({
  href: item.href,
  label: item.label,
  icon: item.icon.solid,
}));

const extras: Destination[] = [
  {
    href: SETTINGS_HREF,
    label: "Settings",
    icon: Cog6ToothIcon,
  },
  {
    href: "/admin",
    label: "Admin",
    icon: ShieldCheckIcon,
  },
];

/** The destination a path belongs to, by its longest matching root. */
export function destinationFor(path: string | null): Destination {
  const pathname = (path ?? "").split(/[?#]/)[0];
  let best: Destination | null = null;
  for (const item of [...destinations, ...extras]) {
    const matches =
      pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && (!best || item.href.length > best.href.length)) best = item;
  }
  return (
    best ?? {
      href: pathname || "/home",
      label: "Page",
      icon: GlobeAltIcon,
    }
  );
}
