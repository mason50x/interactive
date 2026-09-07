# Learning Simulator — MVP implementation plan

Status: implemented locally and deployed to the development Convex instance on September 4, 2026. Production deployment and commit have not been performed. See the verification report at the end for tested scope and remaining checks.

## Product decisions

- Add **Learning Simulator** as its own sidebar destination after Activities and before Chat. Use a paired outline/solid `CpuChipIcon`, the existing active-route behavior, and existing responsive rail. No extra notification dot.
- Use Learning Simulator in headings, navigation, metadata, empty states, and first-party filenames. Controls say Open file, Start, Resume, Pause, Restart, Save now, Saves, and Export progress. Keep required upstream license notices intact in technical distribution files.
- Run a pinned, self-hosted WASM core with our own interface. Use binjgb pinned to `c60e138da5a795ebb55e56b11b7e90024e41112c`; the checkpoint ABI is 199,608 bytes and has been verified with cross-instance restore. No runtime CDN dependency.
- Support `.gb` and `.gbc` inputs initially. Explain accepted extensions in the file picker without hardware branding in the interface. No archive extraction, remote URL imports, BIOS imports, or additional systems in MVP.
- Support locally selected files. No built-in games are bundled.
- Imported program bytes are cached **locally in account-namespaced IndexedDB**, separately from progress. Never upload them, keep file-system handles, or include them in logs, telemetry, or URLs. Refreshing or returning loads the cached bytes and verifies their content hash. Deleting an entry or clearing local progress also deletes its cached ROM. Storage failures fall back to selecting the original file.
- Persist progress locally and in the signed-in user's cloud account automatically. Cloud metadata includes content hash, display label, format, and timestamps; it does not include the selected file or its original filename. Derive display labels from uploaded filenames by stripping extensions and common dump metadata; use “Imported simulation” only as a fallback and preserve user-renamed labels.
- Selecting the same bytes again matches existing progress even if the filename changes. A different revision of a file is a different simulation unless an explicit migration is added later.
- No claim that naming, hosting, or this integration prevents school filtering.

## Screens, routes, and navigation

| Route | Responsibility |
| --- | --- |
| `/dashboard/learning-simulator` | Protected library: built-in simulations, saved progress, Open file, storage/settings controls. |
| `/dashboard/learning-simulator/[contentHash]` | Protected player; validate lowercase SHA-256 route parameter; restore matching progress only after the program is available. |

Both pages call `auth.protect()` individually and apply the existing agreement gate. The existing proxy already protects `/dashboard(.*)`. The nested layout owns an ephemeral client session provider so a file selected on the library page survives navigation to the player. Leaving this route subtree destroys the runtime and drops byte references.

Direct navigation to a built-in hash resolves a server-owned manifest entry. Direct navigation to an imported hash loads the account’s local ROM cache, falling back to “Select the original file to resume” when unavailable; hashes grant no access to another user's saves. A valid unknown hash can show the same prompt without revealing whether another user has used it. Invalid hashes return 404.

Player layout: title and back link, centered pixel-preserving canvas, compact controls, optional touch controls, and a small save status. Reuse current design tokens and UI primitives. Fullscreen targets the player container so controls stay available; offer a viewport-filling layout where native fullscreen is unavailable. Audio starts only after a user gesture.

Save status distinguishes “Saved on this device”, “Synced”, “Waiting for connection”, “Cloud save failed”, and “Progress conflict”. Never label a failed cloud save as synced. If local storage fails, allow cloud saving and explain the missing local backup; if both fail, retain the in-memory snapshot and offer export.

The simulator is a first-party client player, not an external Activities bundle. It consumes the existing dashboard Clerk/Convex providers directly. Do not add a nested iframe or a second Convex client. Keep existing Activities routing and search catalogue unchanged. The sidebar destination is discoverable independently; simulation-specific search belongs on the simulator library in MVP.

## File inventory

Paths below are relative to `/Users/mason/Desktop/50x`. This is the intended implementation inventory; generated outputs are generated, not hand-maintained.

| New file | Responsibility |
| --- | --- |
| `src/app/dashboard/learning-simulator/layout.tsx` | Ephemeral session provider boundary; no heavy engine initialization. |
| `src/app/dashboard/learning-simulator/page.tsx` | Protected library server page and built-in metadata. |
| `src/app/dashboard/learning-simulator/[contentHash]/page.tsx` | Protected player server page, route validation, manifest lookup. |
| `src/app/dashboard/learning-simulator/loading.tsx` | Lightweight route loading state. |
| `src/app/dashboard/learning-simulator/error.tsx` | Recoverable route failure UI. |
| `src/components/simulator/session-provider.tsx` | Account-scoped local ROM caching and in-memory file ownership. |
| `src/components/simulator/library.tsx` | Built-ins, recent progress, file selection, rename/delete actions. |
| `src/components/simulator/player.tsx` | Browser-only engine loading and player lifecycle. |
| `src/components/simulator/controls.tsx` | Transport, volume, keyboard/gamepad/touch input and focus handling. |
| `src/components/simulator/saves-panel.tsx` | Three manual slots, restore previous autosave, export/import progress, conflict choices. |
| `src/components/simulator/save-status.tsx` | Separate local/cloud persistence state. |
| `src/lib/simulator/types.ts` | Typed engine interface, session state, save envelope, result types. |
| `src/lib/simulator/catalogue.ts` | `server-only` built-in manifest and hash lookup; no user imports. |
| `src/lib/simulator/files.ts` | File size/header/mapper checks, hash calculation, safe labels. |
| `src/lib/simulator/engine.ts` | Pinned-core adapter: load, input, frame/audio, pause, capture, restore, dispose. |
| `src/lib/simulator/progress.ts` | Versioned progress envelope validation and import/export. |
| `src/lib/simulator/local-store.ts` | IndexedDB transactions, schema migration, per-account namespacing, quota handling. |
| `src/lib/simulator/sync.ts` | Serialized autosave, outbox, reconciliation, retry and conflict state machine. |
| `src/lib/simulator/use-simulator.ts` | React orchestration; attach/detach listeners and timers. |
| `src/lib/simulator/settings.ts` | Device-specific volume and touch-control visibility. The canvas scales responsively; keyboard mappings are fixed for MVP. |
| `convex/simulator/shared.ts` | Auth/owner/agreement checks, typed limits, validation helpers. |
| `convex/simulator/library.ts` | List, get, register, rename, remove. |
| `convex/simulator/saves.ts` | Save metadata, explicit payload reads, atomic commit, restore/delete. |
| `convex/simulator/limits.ts` | Existing rate-limiter component configuration for simulator operations. |
| `convex/simulator/cleanup.ts` | Bounded account-deletion cleanup. |
| `public/simulator/core/<build-id>/runtime.js` | Pinned generated core loader. |
| `public/simulator/core/<build-id>/runtime.wasm` | Matching pinned generated binary. |
| `public/simulator/core/<build-id>/LICENSE.txt` | Unmodified required upstream notices. |
| `public/simulator/core/<build-id>/build.json` | Source commit, artifact checksums, ABI/save-format version. |
| `scripts/build-simulator-core.mjs` | Reproducible build/download verification against a pinned source/artifact version. |
| `scripts/check-simulator.mjs` | Save-format, file-validation, and reconciliation regression checks. |
| `scripts/tests/simulator-cloud.test.ts` | Isolated Convex integration checks with two authenticated test identities, ownership, concurrency, limits and deletion. |
| `docs/learning-simulator-mvp.md` | This plan; update implementation status as work lands. |

Existing files to edit:

- `src/lib/nav.ts`: sidebar entry and destination constant; `NAV_HREFS` already derives from the entries. Check the long label in the expanded/mobile rail; change `app-sidebar.tsx` only if needed for fit.
- `convex/schema.ts`: two additive tables below.
- `convex/users.ts`: schedule simulator cleanup from `deleteFromClerk`; remove access immediately by requiring an existing user for cloud writes.
- `package.json` and lockfile: simulator verification commands and only dependencies actually required by the adapter/testing.
- `README.md`: built-in asset preparation, pinned build procedure, save/privacy behavior and development verification.
- `convex/_generated/*`: normal codegen as required.

No new Next API route, HTTP action, file-upload endpoint, production secret, service worker, cron, or storage bucket is needed for this MVP. Existing account authentication and agreement infrastructure is reused.

## Runtime design

Follow the installed Next guide: load the browser-only player with `next/dynamic({ ssr: false })` from a Client Component. Route warming can fetch shell code, but must not initialize WASM, request built-in program bytes, or start audio. Fetch the core and selected built-in only on intent to start.

Use a single-threaded core for MVP, avoiding a site-wide cross-origin-isolation header change. Use the core's browser scheduling/audio approach behind the adapter, keep frame buffers out of React state, and verify interaction responsiveness on a representative Chromebook and phone. Worker/offscreen rendering is a subsequent optimization only if measurements justify it.

Validate inputs before initialization: supported extension, nonempty bytes, proposed 8 MiB maximum, valid header and supported mapper. Check the pinned core's actual compatibility; present a clear unsupported-file error rather than assuming every accepted extension works. Built-ins also get SHA-256 integrity verification against the manifest.

Release input on blur, visibility change, pointer cancellation and gamepad disconnect to prevent stuck buttons. Pause when hidden. Dispose animation loops, audio nodes/context, listeners, native allocations and object URLs on replacement/unmount/sign-out. Only handle shortcuts while the player has focus; text fields and existing app shortcuts retain priority.

Use explicit engine save exports, never a dump of the entire WASM heap: the heap contains imported program bytes. Audit the pinned serializer and verify that it does not serialize the source ROM buffer. Normal emulated working memory may contain bytes the running program copied there; progress is not a byte-for-byte copy of the imported file. Do not promise that no byte derived from the program can ever appear in a checkpoint.

Each progress envelope binds `contentHash`, `engineBuild`, `formatVersion`, mode, capture time, checkpoint bytes and battery/clock data. Capture those components at one paused frame boundary, then resume. The adapter restores a checkpoint once; it must not overwrite that checkpoint's memory with unrelated newer battery data. If checkpoint versions differ, reject loading with an explicit version error and retain the backup. The MVP does not convert saves across core versions; export and a deliberate new session are required.

## Local persistence and save cadence

Use IndexedDB for binary progress. Use localStorage only for small device settings. Keys include deployment/environment, authenticated Clerk subject, content hash and slot. Never share local progress between accounts automatically.

The version-1 `progress` store contains one bounded record per account/content hash, with metadata, five save slots and the pending outbox written atomically together. Small volume/touch settings use localStorage. Outbox stores progress only, not program bytes. Future schema upgrades must preserve old payloads until conversion succeeds.

- Capture local autosave every **10 seconds of active execution**, only when frames advanced; debounce battery-dirty signals to at most one local capture per 2 seconds.
- Sync the latest local capture to cloud every **60 seconds** while dirty. Keep at most one in-flight write and one coalesced pending snapshot per simulation.
- Save locally on pause, explicit Save now, file replacement, and in-app exit; attempt an immediate cloud flush if online. Page-hide/unload flushes are best effort only. Normal cadence is the durability guarantee; do not depend on finishing network work during unload.
- Keep current and previous autosaves and **three manual slots**, locally and in cloud. Restore the previous autosave through the same conflict-safe commit path.
- Commit snapshot plus pending-outbox intent in one IndexedDB transaction. A cloud acknowledgement clears only the acknowledged capture ID; a newer capture made during the request remains pending and is rebased onto the accepted revision.
- On a network failure, keep local progress and retry with jittered exponential backoff, capped at 60 seconds. Stop retrying on auth, validation or conflict failures until the cause is resolved.
- Saving manual slots is independent of the autosave timer. Importing a progress file requires matching content hash/version and a valid bounded envelope; it becomes a new local pending save.
- Sign-out pauses/disposes the runtime and cancels requests. Leave account-namespaced local progress for that account unless the user selects the library trash control to clear all progress. Re-check identity before reading/uploading any pending outbox after sign-in. Local saves are not encrypted protection against someone with access to the browser profile.
- No service worker/offline app-shell promise in MVP. An already loaded simulation continues offline; a fresh offline visit or reload may not load the app. Imported files always require reselection after reload.

## Convex data model

Store bounded binary payloads as `v.bytes()` in dedicated documents, not in `_storage`. The current attachment sweep assumes all storage files are chat images and would delete unrecognized simulator blobs. Direct save documents avoid that interaction and allow atomic metadata/payload writes.

Proposed hard limits: **20 library entries per account**, **five save slots per entry**, **512 KiB total binary payload per save**, with a tightly bounded metadata envelope. This bounds raw cloud payload storage at 50 MiB per account, excluding document overhead. Verify the pinned core fits this cap in the initial spike; adjust the design explicitly before implementation if it does not. Do not silently drop battery data or disable autosave to fit it.

| Table | Fields and indexes |
| --- | --- |
| `simulatorEntries` | `ownerClerkId`, `contentHash`, `label`, `source: builtin/imported`, optional `builtinId`, `mode: mono/color`, `createdAt`, `lastOpenedAt`, `updatedAt`, monotonic `revision`, optional `latestSavedAt`. Indexes `by_ownerClerkId_and_contentHash`, `by_ownerClerkId_and_lastOpenedAt`. |
| `simulatorSaves` | `ownerClerkId`, `entryId`, `slot: auto/previous/manual1/manual2/manual3`, `captureId`, `revision`, `engineBuild`, `formatVersion`, `capturedAt`, server `savedAt`, `checkpoint: bytes`, optional `battery: bytes`. Size is validated rather than duplicated in metadata; clock state is part of the native checkpoint. Indexes `by_entryId_and_slot`, `by_ownerClerkId`. |

An entry ID acts as a generation identifier. Deleting and recreating the same content creates a new ID, so an old outbox cannot resurrect a deleted save. Every commit names an existing owned entry; only explicit registration creates entries.

Keep library queries on metadata rows only. Save-list responses omit bytes; they read at most five save records. Initialization reads up to five individual payloads once to make slots available offline; later reads are explicit when reconciling or restoring. No reactive subscription that repeatedly ships binary saves every minute. The entry metadata subscription can report newer cloud revisions without replacing the running simulation.

## Backend function contract

All public functions use object-form args and return validators. Derive owner identity from auth, never a client owner argument. Writes require an existing account and accepted agreement; owned export/delete remain available for data management if an agreement changes. All reads verify ownership. Use indexed, bounded reads; enforce uniqueness in transactions.

| Function | Kind | Contract |
| --- | --- | --- |
| `simulator/library:list` | Query | Bounded owned metadata (maximum 20) ordered by last open; no payload bytes. |
| `simulator/library:get` | Query | Owned metadata by content hash, or null. |
| `simulator/library:register` | Mutation | Validate hash/mode/label; idempotent create or touch; enforce 20-entry bound transactionally. Built-in designation must match a server-validated manifest allowlist rather than trusting a client claim. |
| `simulator/library:rename` | Mutation | Update bounded label on an owned entry. |
| `simulator/library:remove` | Mutation | Delete owned entry and at most five save rows atomically. Client also removes local saves/outbox when “Delete everywhere” is selected. |
| `simulator/saves:list` | Query | At most five slot metadata records for owned entry. |
| `simulator/saves:read` | Query | Explicit one-shot payload retrieval by owned entry and slot. |
| `simulator/saves:commit` | Mutation | Validate envelope/size, `entryId`, `expectedRevision`, capture ID and slot; CAS entry revision; rotate autosave to previous; atomically persist payload and increment revision. |
| `simulator/saves:restore` | Mutation | CAS-protected promotion of an existing owned slot to autosave; preserve displaced autosave as previous. Return metadata; fetch payload explicitly before resuming. |
| `simulator/saves:remove` | Mutation | CAS-protected removal of a slot and revision increment so stale writers cannot overwrite deletion unnoticed. |
| `simulator/cleanup:purgeOwner` | Internal mutation | Bounded deletion by owner, rescheduling until complete; invoked by account-deletion webhook. |


Use the installed rate-limiter component with a simulator-specific namespace, independent of chat trust tiers. Proposed save allowance: 6 writes/minute/account with burst capacity 10, including manual saves; library registration/rename gets a separate bounded bucket. Validate first and return retry timing. Enforce limits server-side; client debounce is not enforcement.

The server validates byte lengths and known envelope/build structure. It cannot prove arbitrary client bytes are honest emulator output; do not market this as semantic ROM detection. The first-party client never sends the imported file, and the endpoint accepts only bounded progress envelopes rather than general file uploads.

## Conflicts, retries, and deletion

Use server revisions, not device timestamps, to choose whether a write can commit. Every cloud write supplies the revision last observed before the local branch began. A mismatching revision returns a structured conflict without changing cloud data. A repeated current/recent capture ID returns the existing acknowledgement without rotating saves again; older retries still fail CAS rather than overwriting newer progress.

On open/reconnect:

1. If local has no pending edits, restore the newest compatible cloud revision.
2. If local is pending and its base revision matches cloud, upload the newest local capture.
3. If both changed, preserve local progress, pause autosync and show “Use this device” / “Use cloud”. Do not select based on clocks.
4. “Use this device” fetches the current revision and explicitly commits against it, preserving displaced cloud autosave as previous. If another write intervenes, show conflict again.
5. “Use cloud” first preserves/export-offers the local branch, then restores cloud. Keep one bounded temporary local conflict backup outside normal slots until resolved.

Use Web Locks to avoid two tabs writing the same local entry. A second tab cannot start until the first closes and the second reloads. Browsers without Web Locks receive an explicit unsupported-browser message; there is no unreliable lease fallback. Server CAS remains authoritative across devices. Two devices may run, but cannot silently overwrite each other's diverging progress.

Cloud deletion does not physically clear offline browsers. On reconnect, missing/different entry generation invalidates that browser's pending cloud write. Offer local export or explicit recreation; never recreate automatically. Account deletion schedules cloud cleanup and prevents new writes. Device copies remain account-namespaced until explicitly cleared. The library trash control clears all listed cloud entries and this account’s local saves after its inline confirmation. Row Delete removes one entry from both.

## Delivery order and acceptance gates

1. **Engine/save spike:** pin a build, run an approved sample, validate mono/color inputs, audio, save/restore, battery/clock handling, snapshot size, and that no ROM buffer enters a progress envelope. Measure frame pacing on target devices. This resolves the remaining engine-specific uncertainties before schema constants are finalized.
2. **Routes and runtime:** sidebar, protected pages, ephemeral provider, built-in/import flow, controls and teardown. Verify core assets load only on player intent and long sidebar label fits.
3. **Local progress:** IndexedDB, slots, import/export and persistence failures. Refresh → reselect same file → resume; rename file → same progress; different bytes → distinct entry.
4. **Cloud backend:** additive schema, validators/indexes, limits, cleanup, generated API and development deployment. Test two authenticated owners: neither can read, write, restore or delete the other's records.
5. **Synchronization:** retries, reload with pending outbox, lost acknowledgement, concurrent tabs/devices, manual slot changes during an in-flight autosave, conflict choice and stale deletion generation.
6. **End-to-end release checks:** built-in cold launch, imported launch, local resume, second-device cloud resume after reselection, one-hour retention, offline recovery, storage quota refusal, unsupported/corrupt save, core-version mismatch, account deletion and mobile audio/fullscreen behavior.

Privacy verification inspects requests, IndexedDB, localStorage and Cache Storage after importing a uniquely identifiable test file. ROM bytes may persist only in the separate account-namespaced IndexedDB programs store. They must not enter network requests, progress records, localStorage, Cache Storage, or logs. No file handle is kept. Check that core serialization does not contain the full source buffer; distinguish ordinary working-memory contents from storing the ROM.

Run targeted lint, Next type generation if routes require it, TypeScript, save/sync regression checks, development Convex push, and authenticated runtime checks. Build/static checks alone do not establish cloud autosave correctness. Leave implementation uncommitted unless requested; production rollout is a separate concrete deployment step.

MVP excludes rewind, achievements, multiplayer/linking, screenshots, unlimited save history, cloud ROM libraries and full offline installation. Fast-forward is optional only after normal-speed audio/timing and saves pass; reliable progress takes priority.

## Source references and current evidence

- Current app: `src/lib/nav.ts`, `src/app/dashboard/layout.tsx`, `src/proxy.ts`, `src/app/learn/[slug]/page.tsx`, `convex/schema.ts`, `convex/agreement.ts`, `convex/users.ts`, `convex/chat/attachments.ts`.
- Installed Next guidance: `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`.
- Core candidate and licensing: https://github.com/binji/binjgb
- Save API inspected: https://raw.githubusercontent.com/binji/binjgb/main/src/emulator.c — distinct checkpoint and external-RAM exports. The pinned version was audited and exercised by the engine checks.

## Implementation and verification report

Additional implemented files: `src/components/simulator/player-loader.tsx`, `src/lib/simulator/lock.ts`, `convex/simulator/model.ts`, `scripts/tests/simulator-sync.test.ts`, `scripts/tests/simulator-files.test.ts`, and `vitest.config.mts`. Vendored generated runtime code is excluded from ESLint; all first-party simulator code remains checked.

The simulator ships without bundled games. Users open local files. Engine checks use a test-only idle-loop cartridge generated in memory. There is no runtime CDN, ROM upload function, file-handle persistence or service-worker cache.

Verified so far:

- Native WASM: mono/color execution, directional input, rendered checkpoint restoration in a fresh instance, battery export, exact state ABI and exclusion of the source program buffer.
- 22 Vitest tests: cloud ownership with separate identities, accepted-agreement enforcement, entry/slot limits, revision conflicts, capture idempotence, stale generation deletion, account cleanup, outbox reload, in-flight coalescing, lost acknowledgements, backoff, offline divergence and explicit conflict resolution; file hashing, renamed inputs, color headers, corrupt inputs, bounded progress imports and stripping unknown import fields.
- Helium with the Chrome extension, signed into the real development account: built-in launch, pause/resume, manual slot save, local IndexedDB payload inspection, successful cloud autosave, cloud-only recovery after verifying the local store was empty, offline local save followed by automatic cloud reconnect, and duplicate-tab guard. Responsive layout checked at 390 by 844 as well as desktop.
- TypeScript, targeted ESLint and Next production build pass. Cloud runtime checks use `dev:cheerful-guanaco-637`; no production deployment was performed.

Remaining release checks: automated native file selection in Helium requires the extension's Allow access to file URLs setting; until enabled, import/reselection is covered at the file/engine/storage layers but not the complete browser chooser flow. Physical Chromebook performance, a real phone's audio/fullscreen/controller behavior and a one-hour soak remain unverified. A resized desktop viewport does not establish physical-device performance. Only the currently pinned checkpoint format is supported; cross-version save migration, remappable keyboard bindings and native offline installation are outside this MVP.

