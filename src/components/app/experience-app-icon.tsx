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
