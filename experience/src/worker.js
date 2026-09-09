/**
 * The allowlisted experience's server half: a Bare v3 server on Cloudflare
 * Workers, with the allowlist enforced before anything is fetched.
 *
 * ## What a Bare server is
 *
 * The rewriting engine does all the URL and script rewriting in a service worker in the
 * browser. What it cannot do from there is fetch a cross-origin page raw, so
 * it sends each request here with the real destination in `x-bare-url` and the
 * headers it wants sent in `x-bare-headers`, and gets the upstream response
 * back with the upstream status and headers in `x-bare-status` and
 * `x-bare-headers`. That is the whole protocol; the client this is written
 * against is `@mercuryworkshop/bare-as-module3`, and the wire format below is
 * taken from its source rather than a spec the community port drifted from.
 *
 * ## Why not the existing Workers port
 *
 * `tomphttp/bare-server-worker` was last touched in 2023 and only speaks v1
 * and v2, which the current engine transport no longer sends. It also
 * kept WebSocket state in KV, which on the Free plan is 1,000 writes a day.
 * This speaks v3 only and needs no storage: a proxied WebSocket is one
 * inbound socket paired with one outbound `fetch` upgrade, both in memory.
 *
 * ## The allowlist
 *
 * `config/experience-allowlist.json` is shared with the app, which uses it to list
 * the sites; this is the copy that matters. A host matches if it equals an
 * entry or is a subdomain of one. Everything else is refused with a Bare error
 * before a byte is fetched, so the Worker never acts as an open relay no
 * matter what the browser-side config is edited to say.
 *
 * Everything outside `/v3/` is a static file, the experience frontend, and
 * is answered by the asset binding. See wrangler.toml.
 */

import allowlist from "../../config/experience-allowlist.json";

/**
 * Each entry allows a host and its subdomains. An entry with `paths` allows
 * only URLs whose path starts with one of them, which is how a site's
 * dependency on one script at a huge domain is met without opening the whole
 * domain — YouTube needs one path on google.com, not Google Search.
 */
const SITES = allowlist.sites.map((site) => ({
  host: site.host.toLowerCase(),
  paths: Array.isArray(site.paths) && site.paths.length ? site.paths : null,
}));

/** The client splits `x-bare-headers` into numbered parts past this length. */
const MAX_HEADER_VALUE = 3072;

/**
 * Request headers the browser side hands us that must not be forwarded. The
 * runtime sets its own hop-by-hop and framing headers, and `accept-encoding`
 * stays out so the runtime negotiates an encoding it will also decode: the
 * body we stream back is already decompressed, and saying otherwise to the
 * client would make it decode plain bytes.
 */
const DROP_REQUEST = new Set([
  "host",
  "connection",
  "upgrade",
  "transfer-encoding",
  "content-length",
  "accept-encoding",
  "keep-alive",
  "proxy-connection",
  "sec-websocket-key",
  "sec-websocket-version",
  "sec-websocket-extensions",
]);

/**
 * Upstream response headers that describe the bytes as they were on the wire
 * to us, not the bytes we send on. The runtime decompresses the body, so a
 * `content-encoding` here would be a lie the client would act on.
 */
const DROP_RESPONSE = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
]);

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "*",
  "access-control-expose-headers": "*",
  "access-control-max-age": "7200",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/v3/" || url.pathname === "/v3") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS });
      }
      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        return relayWebSocket(request);
      }
      return relayHttp(request);
    }

    // The Bare manifest. Nothing in the engine reads it, but it is the
    // quickest way to check a deployment is alive, and other Bare clients do.
    if (url.pathname === "/bare/") {
      return json(200, {
        versions: ["v3"],
        language: "JavaScript",
        project: {
          name: "il-experience",
          description: "Allowlisted Bare v3 server on Cloudflare Workers",
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
};

/** One proxied HTTP request. */
async function relayHttp(request) {
  const bare = joinHeaders(request.headers);

  const target = parseTarget(bare.get("x-bare-url"), ["http:", "https:"]);
  if (target.error) return target.error;

  let requestHeaders;
  try {
    requestHeaders = JSON.parse(bare.get("x-bare-headers") ?? "");
    if (!requestHeaders || typeof requestHeaders !== "object") throw new Error();
  } catch {
    return bareError(
      400,
      "INVALID_BARE_HEADER",
      "request.headers.x-bare-headers",
      "Header was not valid JSON.",
    );
  }

  const headers = new Headers();
  for (const [name, value] of Object.entries(requestHeaders)) {
    if (DROP_REQUEST.has(name.toLowerCase())) continue;
    for (const one of Array.isArray(value) ? value : [value]) {
      try {
        headers.append(name, one);
      } catch {
        // A header the runtime refuses to send is not worth failing the page for.
      }
    }
  }
  // Headers named in `x-bare-forward-headers` are copied from the real
  // request rather than the JSON, so the client can forward what the browser
  // itself set. The current transport sends none, but it is part of v3.
  for (const name of listHeader(bare, "x-bare-forward-headers")) {
    const value = request.headers.get(name);
    if (value !== null && !DROP_REQUEST.has(name.toLowerCase())) {
      headers.set(name, value);
    }
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? request.body : undefined;

  let upstream;
  try {
    upstream = await fetch(target.url, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
    });
  } catch (error) {
    // Visible in `npm run tail`; the client only sees the Bare error.
    console.error("upstream fetch failed", request.method, target.url.href, String(error?.message ?? error));
    return bareError(
      500,
      "CONNECTION_REFUSED",
      "response",
      String(error?.message ?? error),
    );
  }

  const responseHeaders = {};
  for (const [name, value] of upstream.headers) {
    if (name === "set-cookie" || DROP_RESPONSE.has(name)) continue;
    responseHeaders[name] = value;
  }
  const cookies = upstream.headers.getSetCookie?.() ?? [];
  if (cookies.length) responseHeaders["set-cookie"] = cookies;

  const out = new Headers(CORS);
  out.set("cache-control", "no-store");
  out.set("x-bare-status", String(upstream.status));
  out.set("x-bare-status-text", upstream.statusText || "");
  setSplitHeader(out, "x-bare-headers", asciiJson(responseHeaders));

  // Headers named in `x-bare-pass-headers` are also set on the real response,
  // and statuses in `x-bare-pass-status` are passed through instead of 200.
  for (const name of listHeader(bare, "x-bare-pass-headers")) {
    const value = upstream.headers.get(name);
    if (value !== null) out.set(name, value);
  }
  const passStatus = listHeader(bare, "x-bare-pass-status").map(Number);
  const status = passStatus.includes(upstream.status) ? upstream.status : 200;

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status,
    headers: out,
  });
}

/**
 * One proxied WebSocket.
 *
 * The client opens a socket to us, sends one JSON `connect` message naming
 * the real destination, and expects one JSON `open` message back before any
 * frames. From then on it is a byte pipe in both directions.
 */
function relayWebSocket() {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();

  const onConnect = (event) => {
    server.removeEventListener("message", onConnect);

    let message;
    try {
      message = typeof event.data === "string" ? JSON.parse(event.data) : null;
    } catch {
      message = null;
    }
    if (!message || message.type !== "connect") {
      safeClose(server, 1008, "First message was not a connect.");
      return;
    }

    const target = parseTarget(message.remote, ["ws:", "wss:", "http:", "https:"]);
    if (target.error) {
      safeClose(server, 1008, "Host is not on the allowlist.");
      return;
    }

    connectUpstream(server, target.url, message).catch((error) => {
      safeClose(server, 1011, String(error?.message ?? error));
    });
  };
  server.addEventListener("message", onConnect);

  return new Response(null, { status: 101, webSocket: client });
}

async function connectUpstream(server, url, message) {
  // Outbound sockets are opened as an HTTP upgrade; the runtime speaks ws
  // from there. `ws:` and `wss:` are what the client sends.
  const fetchUrl = new URL(url);
  if (fetchUrl.protocol === "wss:") fetchUrl.protocol = "https:";
  if (fetchUrl.protocol === "ws:") fetchUrl.protocol = "http:";

  const headers = new Headers();
  for (const [name, value] of Object.entries(message.headers ?? {})) {
    if (DROP_REQUEST.has(name.toLowerCase())) continue;
    try {
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    } catch {
      // Skip what the runtime will not send.
    }
  }
  headers.set("upgrade", "websocket");
  headers.set("connection", "Upgrade");
  const protocols = Array.isArray(message.protocols)
    ? message.protocols.filter(Boolean)
    : [];
  if (protocols.length) headers.set("sec-websocket-protocol", protocols.join(", "));

  const response = await fetch(fetchUrl, { headers });
  const upstream = response.webSocket;
  if (!upstream) {
    safeClose(server, 1011, `Upstream answered ${response.status} instead of upgrading.`);
    return;
  }
  upstream.accept();

  server.send(
    JSON.stringify({
      type: "open",
      protocol: response.headers.get("sec-websocket-protocol") ?? "",
      setCookies: response.headers.getSetCookie?.() ?? [],
    }),
  );

  upstream.addEventListener("message", (event) => {
    try {
      server.send(event.data);
    } catch {
      safeClose(upstream, 1011, "Client went away.");
    }
  });
  server.addEventListener("message", (event) => {
    try {
      upstream.send(event.data);
    } catch {
      safeClose(server, 1011, "Upstream went away.");
    }
  });
  upstream.addEventListener("close", (event) => safeClose(server, event.code, event.reason));
  server.addEventListener("close", (event) => safeClose(upstream, event.code, event.reason));
  upstream.addEventListener("error", () => safeClose(server, 1011, "Upstream socket error."));
  server.addEventListener("error", () => safeClose(upstream, 1011, "Client socket error."));
}

/* ------------------------------------------------------------------------ */

/** Parse and allowlist-check a destination. Returns `{ url }` or `{ error }`. */
function parseTarget(raw, protocols) {
  let url;
  try {
    url = new URL(raw ?? "");
  } catch {
    return {
      error: bareError(400, "INVALID_BARE_HEADER", "request.headers.x-bare-url", "Not a URL."),
    };
  }
  if (!protocols.includes(url.protocol)) {
    return {
      error: bareError(
        400,
        "INVALID_BARE_HEADER",
        "request.headers.x-bare-url",
        "Unsupported scheme.",
      ),
    };
  }
  if (!isAllowed(url)) {
    return {
      error: bareError(
        403,
        "HOST_NOT_ALLOWED",
        "request.headers.x-bare-url",
        `${url.hostname}${url.pathname} is not on the allowlist.`,
      ),
    };
  }
  return { url };
}

function isAllowed(url) {
  const host = url.hostname.toLowerCase();
  return SITES.some(
    ({ host: allowed, paths }) =>
      (host === allowed || host.endsWith(`.${allowed}`)) &&
      (!paths || paths.some((prefix) => url.pathname.startsWith(prefix))),
  );
}

/** A v3 error: JSON with a code, the field it concerns, and a message. */
function bareError(status, code, id, message) {
  return json(status, { code, id, message });
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

/**
 * Reassemble `x-bare-headers` if the client split it. Each part is
 * `x-bare-headers-<n>` with a leading `;` so proxies cannot fold it.
 */
function joinHeaders(headers) {
  const output = new Headers(headers);
  if (!headers.has("x-bare-headers-0")) return output;

  const parts = [];
  for (const [name, value] of headers) {
    const match = /^x-bare-headers-(\d+)$/.exec(name);
    if (!match) continue;
    parts[Number(match[1])] = value.startsWith(";") ? value.slice(1) : value;
    output.delete(name);
  }
  output.set("x-bare-headers", parts.join(""));
  return output;
}

/** Set a header, splitting it the same way the client does if it is long. */
function setSplitHeader(headers, name, value) {
  if (value.length <= MAX_HEADER_VALUE) {
    headers.set(name, value);
    return;
  }
  let part = 0;
  for (let i = 0; i < value.length; i += MAX_HEADER_VALUE) {
    headers.set(`${name}-${part++}`, `;${value.slice(i, i + MAX_HEADER_VALUE)}`);
  }
}

/** Header values are bytes, not text: escape anything JSON would leave raw. */
function asciiJson(value) {
  return JSON.stringify(value).replace(
    /[\u0080-\uffff]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/** A comma-separated header, as its trimmed, non-empty items. */
function listHeader(headers, name) {
  return (headers.get(name) ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Close a socket without throwing. Codes 1005, 1006 and 1015 are reserved:
 * a peer can report them but nobody may send them, so they become a plain
 * 1000.
 */
function safeClose(socket, code, reason) {
  const sendable =
    code >= 1000 && code !== 1005 && code !== 1006 && code !== 1015 ? code : 1000;
  try {
    socket.close(sendable, (reason ?? "").slice(0, 120));
  } catch {
    // Already closed.
  }
}
