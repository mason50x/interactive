import BareTransport from "/transport/index.mjs";

// BareMux transfers request bodies as streams. Chromium cannot upload those
// over HTTP/1.1 (including wrangler dev), so materialize local request bodies.
// Responses, including video, continue to stream without buffering.
export default class ExperienceTransport extends BareTransport {
  async request(remote, method, body, headers, signal) {
    if (
      ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) &&
      body instanceof ReadableStream
    ) {
      body = await new Response(body).arrayBuffer();
    }
    return super.request(remote, method, body, headers, signal);
  }
}
