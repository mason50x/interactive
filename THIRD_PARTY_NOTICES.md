# Third-party materials and license scope

The root MIT license applies to original application code and documentation.
It does not grant rights in third-party media, external game bundles, names,
logos, or trademarks. Dependencies retain their individual licenses.

| Material | Source / terms | Status |
| --- | --- | --- |
| `public/simulator/core/c60e138/` | [binji/binjgb](https://github.com/binji/binjgb), commit `c60e138da5a795ebb55e56b11b7e90024e41112c`; MIT | License included as `LICENSE.txt`; runtime hashes verified by `npm test` |
| Worker rewriting engine | `@titaniumnetwork-dev/ultraviolet`; MIT | Installed from the lockfile; build copies upstream license |
| Worker transport and bridge | `@mercuryworkshop/bare-as-module3`, `@mercuryworkshop/bare-mux` | Installed from the lockfile; build copies upstream licenses |
| `public/thumbnails/` | Catalogue imports from [a456pur/seraph](https://github.com/a456pur/seraph); individual games/art have different rightsholders | Per-image redistribution permission has not been established here; excluded from the MIT grant |
| `public/chat/bot-avatar.png` | See [source attribution](public/chat/ASSETS.md) | Source recorded; character/art redistribution rights are not established by attribution alone; excluded from the MIT grant |
| Hosted activity bundles | External asset bucket; maintenance scripts import from Seraph | Not part of the source distribution; upstream hosting does not establish rights to each game |
| Other image/audio/video/brand files under `public/` and icons under `src/app/` | Project media and third-party branding | Not included in the code license grant; verify provenance before redistributing or rebranding |
| npm dependencies | Exact versions and license metadata in both lockfiles | Keep upstream notices when redistributing bundles |

There is no blanket claim that the media collection is open source. A complete
media clearance remains separate from licensing the application source. For a
code-only installation, leave hosted activities disabled and replace media
without established redistribution rights with your own licensed assets.

When adding a third-party asset, record its exact source, revision, author,
license, and any modifications. Include required license text. The catalogue's
ROM exclusions are a content filter, not a rights-clearance process.
