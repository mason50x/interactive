import { GlobeAltIcon } from "@heroicons/react/24/solid";
import Image from "next/image";
import { SolidIcon } from "@/components/ui/icon";

const SERVICE_ICONS: Record<string, string> = {
  x: "/experience/x.png",
  tiktok: "/experience/tiktok.png",
  spotify: "/experience/spotify.ico",
  gemini: "/experience/gemini.svg",
  "apple-music": "/experience/apple-music.png",
};

/**
 * Brand marks are bundled locally so tiles and tabs do not contact the
 * services to render their icons. Sources are in public/experience/ASSETS.md.
 */
export function ExperienceAppIcon({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  const src = SERVICE_ICONS[id];
  if (src) {
    return (
      <Image
        src={src}
        alt=""
        aria-hidden="true"
        width={40}
        height={40}
        unoptimized
        className={className}
      />
    );
  }
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
