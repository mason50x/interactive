/*global __uv*/
// A top-level popup has a separate storage partition from an embedded app.
// Start its own transport before asking the service worker to fetch a page.
// Keep the native target/features arguments (including noopener) intact.
self.__experiencePopupUrl = function (rewritten, target) {
  if (["_self", "_parent", "_top"].includes(String(target).toLowerCase())) {
    return rewritten;
  }
  const destination = __uv.sourceUrl(rewritten);
  try {
    const url = new URL(destination);
    if (!["http:", "https:"].includes(url.protocol)) return rewritten;
    const launcher = new URL("/", __uv.meta.origin);
    launcher.searchParams.set("u", url.href);
    return launcher.href;
  } catch {
    return rewritten;
  }
};
