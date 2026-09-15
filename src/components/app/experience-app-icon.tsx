import { GlobeAltIcon } from "@heroicons/react/24/solid";
import { SolidIcon } from "@/components/ui/icon";

/**
 * The mark for an app in the experience: a brand glyph where we have drawn
 * one, the globe otherwise. Drawn inline rather than fetched, so the list
 * renders without touching the app's own servers.
 */
export function ExperienceAppIcon({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  if (id === "netflix") {
    return (
      <SolidIcon className={className}>
        <rect x="2" y="1" width="20" height="22" rx="4" fill="#141414" />
        <path d="M7 4h3v16l-3 .4zm7 0h3v16.4l-3-.4z" fill="#b20710" />
        <path d="M7 4h3l7 16.4-3-.4z" fill="#e50914" />
      </SolidIcon>
    );
  }
  if (id === "youtube") {
    return (
      <SolidIcon className={className}>
        <rect x="1.5" y="5" width="21" height="14" rx="4.5" fill="#ff0033" />
        <path d="M10 9v6l5-3z" fill="#fff" />
      </SolidIcon>
    );
  }
  return <GlobeAltIcon aria-hidden="true" className={className} />;
}
