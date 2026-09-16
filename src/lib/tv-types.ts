export type TvEpisode = {
  internalId?: string;
  displayName?: string;
  fileId: string;
  season: number;
  number: number;
  title: string;
};
export type TvShow = {
  internalId?: string;
  displayName?: string;
  slug: string;
  title: string;
  genre: string;
  thumbnail: string;
  episodes: TvEpisode[];
  sourceUrl: string;
};
export type TvEntry = Omit<TvShow, "episodes" | "sourceUrl"> & {
  episodeCount: number;
};
