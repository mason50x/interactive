/*global Ultraviolet*/
// The experience engine's client config. Replaces the stock one shipped in the
// package when scripts/build-site.mjs assembles site/dist, because the stock
// paths assume the root and ours sit under /experience/ with our own filenames.
//
// The global names on the left are the engine's own and cannot change here.
// Nothing in this file is a security boundary — it ships to the browser. The
// allowlist lives in src/worker.js.
self.__uv$config = {
  prefix: "/service/",
  encodeUrl: Ultraviolet.codec.xor.encode,
  decodeUrl: Ultraviolet.codec.xor.decode,
  handler: "/experience/handler.js",
  client: "/experience/client.js",
  bundle: "/experience/bundle.js",
  config: "/experience/config.js",
  sw: "/experience/sw.js",
};
