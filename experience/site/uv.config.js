/*global Ultraviolet*/
// Ultraviolet's client config. Overwrites the stock one from the package when
// scripts/build-site.mjs assembles site/dist, because the stock paths assume
// everything sits at the root and ours sits under /uv/.
//
// Nothing here is a security boundary — this file ships to the browser. The
// allowlist lives in src/worker.js.
self.__uv$config = {
  prefix: "/service/",
  encodeUrl: Ultraviolet.codec.xor.encode,
  decodeUrl: Ultraviolet.codec.xor.decode,
  handler: "/uv/uv.handler.js",
  client: "/uv/uv.client.js",
  bundle: "/uv/uv.bundle.js",
  config: "/uv/uv.config.js",
  sw: "/uv/uv.sw.js",
};
