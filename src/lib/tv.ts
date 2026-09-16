import "server-only";
import catalogue from "./tv.catalogue.json";
import type { TvShow } from "./tv-types";

export const TV_SHOWS: readonly TvShow[] = catalogue;
export const findTvShow = (slug: string) =>
  TV_SHOWS.find((show) => show.slug === slug);
