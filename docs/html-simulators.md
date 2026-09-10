# Interactive Simulators: HTML

The dashboard opens in HTML mode first, with an HTML/GB selector and a remembered device preference. Existing `/dashboard/learning-simulator` links and Game Boy cloud saves remain valid. HTML runs client-side in a sandboxed iframe occupying the dashboard shell, with native keyboard/pointer/wheel input and a small, collapsed-by-default overlay that expands to back/reload/fullscreen controls.

## Import and retention

Choose/drop a UTF-8 `.html`/`.htm` file or expand Paste code. Use a self-contained document with embedded JavaScript, CSS, and data-URL assets. The original bytes are hashed and cached in account- and environment-scoped IndexedDB. Identical bytes reuse the entry and progress; edited bytes create a separate entry. The 20-entry device library permits up to 8 MiB per document. Browser storage can be cleared/evicted; persistent storage is requested opportunistically.

The separate `htmlSimulatorEntries` Convex table stores only owner, hash, label, and created/opened timestamps (20 entries/account). There is no HTML upload or HTML progress endpoint. Metadata registration runs once per player mount; a failure doesn't prevent local execution or trigger writes on every save. Cloud-only entries ask for the original HTML on this device. Progress stays on the device. Clearing an entry removes local source and saves plus account metadata; copies on other browsers remain. Reopening a retained copy on another device explicitly registers it again.

## Save API

The frame receives `window.simulator` before any document script executes. It is an asynchronous browser bridge, not an HTTP API:

```html
<script>
(async () => {
  let progress = (await window.simulator.load()) ?? { count: 0 };
  const button = document.querySelector('button');
  const render = () => { button.textContent = `Count: ${progress.count}`; };
  render();
  button.addEventListener('click', async () => {
    progress.count++;
    render();
    try {
      await window.simulator.save(progress);
    } catch (error) {
      // Retain in-memory progress and display a recoverable save error.
      console.error(error.message);
    }
  });
  window.addEventListener('simulator:save-request', () => {
    void window.simulator.save(progress).catch(console.error);
  });
})();
</script>
```

Place this script after the button, or wait for DOMContentLoaded. `load()` returns a copy of the initial restored JSON (or null), and marks the document as supporting saves. `save(value)` accepts JSON up to 256 KiB and resolves only after the IndexedDB transaction succeeds. Save meaningful state changes as they happen; do not rely on page unload. Await saves, debounce high-frequency input, and handle rejection. The parent accepts at most 20 bridge requests/second, and the bridge allows at most 20 pending calls. The player automatically dispatches `simulator:save-request` every 10 seconds while visible and on hide/page-hide as a best-effort final capture; documents can respond with their current state. Users do not need to manage save controls.

The parent retains the latest and previous distinct autosaves and restores the latest automatically on reopening. Repeated identical captures do not write or rotate history. Existing manual-slot data is retained for compatibility, but the player has no manual save menu. State can itself contain whatever the document chooses, so it stays local. Oversized and invalid state is rejected. Web Locks prevents simultaneous player writers on one device. A local save failure is the only save-related notice shown during play.

## Compatibility and isolation

Scripts execute with an opaque sandbox origin (`allow-scripts allow-pointer-lock`, without `allow-same-origin`). Source content is never inserted into the dashboard DOM. A per-session token and exact frame-window identity scope the bridge to its own local record. Imported code cannot use the bridge to fetch credentials, other files, other users' records or send cloud writes.

A policy placed before imported content permits inline JS/CSS and embedded image/font/media data; it blocks network fetches, external scripts/assets, nested frames, forms, and objects. The sandbox denies top navigation and popups; ordinary non-fragment links are prevented. Browser sandboxing is not a resource-usage limit or a guarantee against every possible outbound navigation by hostile JavaScript. Imported documents should be trusted by the person opening them.

Native localStorage/IndexedDB access in opaque frames is unavailable. Existing HTML using those APIs must adopt `window.simulator`; arbitrary runtime state is not automatically captured. Documents without save integration still render, but cannot resume arbitrary JavaScript state. Browser-reserved shortcuts and operating-system trackpad gestures stay browser/system controlled. Native fullscreen includes the overlay; when unavailable, a viewport-filling fallback provides an exit control. A fresh offline load of the authenticated app shell is not guaranteed; cached files are reusable once the shell loads.

## Verification

`npx vitest run scripts/tests/simulator-html*.test.ts` covers local identity/retention, owner isolation, slot rotation, limits, deletion, progress validation, and metadata ownership/account cleanup. GB regression tests remain separate. Backend deployment uses the normal development `npx convex dev --once`; production release is separate.
