"use client";
import { CatalogueCard } from "@/components/app/catalogue-card";
import {
  type ActivityEntry,
  popularityLabel,
  thumbnailSrc,
} from "@/lib/activity";
import { GENRES } from "@/lib/genres";
export function ActivityCard({
  activity,
  note,
}: {
  activity: ActivityEntry;
  note?: string;
}) {
  const meta = GENRES[activity.genre];
  return (
    <CatalogueCard
      title={activity.title}
      href={`/activities/${activity.slug}`}
      thumbnail={thumbnailSrc(activity)}
      category={meta.label}
      hueColor={meta.hue}
      icon={meta.icon}
      note={note ?? popularityLabel(activity)}
    />
  );
}
