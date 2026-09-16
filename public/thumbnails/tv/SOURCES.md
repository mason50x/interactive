# TV thumbnail sources

## Catalog artwork audit — 2026-09-16

The complete, explicit mapping is in [`scripts/data/tv-artwork.json`](../../../scripts/data/tv-artwork.json).
Each record identifies the work, its source page, original artwork URL, local
JPEG, and SHA-256 of the reviewed file. Film records include release years to
distinguish remakes. Series artwork is shared by season entries of that series;
it is not a generic replacement image. Posters retain their original aspect
ratio and are displayed by the existing card crop.

Images are stored locally, so viewing the catalog does not depend on external
poster hosts. Artwork comes from TVmaze, IMDb, the cookbook publisher, and the
actual KJV document cover. Original rights remain with their respective owners.
Run `npm run check:tv-artwork` to check every catalog entry against the manifest,
file signature, and checksum. The catalog generator refuses to write entries
without explicitly mapped artwork.

364 of 367 entries are identified. These three remain unresolved and are
intentionally not given guessed artwork:

- `miku-movie`: the supplied Google Drive file returns 404; its label does not
  establish an exact title.
- `legos-mp4`: the source is named `Legos.mp4`, and its preview is a black frame.
- `the-divine-library`: a mixed folder, not an identified movie or series.

The check reports these as failures until they are identified. Existing generated
SVGs for those entries have not been represented as verified covers.

## Original landscape artwork

Landscape artwork retrieved from TVmaze on 2026-09-16. Original rights remain with the respective owners.

## My Adventures with Superman
- [TVmaze record](https://www.tvmaze.com/shows/55414/my-adventures-with-superman)
- [Original artwork](https://static.tvmaze.com/uploads/images/original_untouched/528/1320723.jpg)

## The Cuphead Show!
- [TVmaze record](https://www.tvmaze.com/shows/42927/the-cuphead-show)
- [Original artwork](https://static.tvmaze.com/uploads/images/original_untouched/396/991620.jpg)

## Static Shock
- [TVmaze record](https://www.tvmaze.com/shows/5950/static-shock)
- [Original artwork](https://static.tvmaze.com/uploads/images/original_untouched/226/566585.jpg)

## One-Punch Man
- [TVmaze record](https://www.tvmaze.com/shows/4201/one-punch-man)
- [Original artwork](https://static.tvmaze.com/uploads/images/original_untouched/219/548004.jpg)

## Avatar: The Last Airbender
- [TVmaze record](https://www.tvmaze.com/shows/555/avatar-the-last-airbender)
- [Original artwork](https://static.tvmaze.com/uploads/images/original_untouched/71/178922.jpg)
