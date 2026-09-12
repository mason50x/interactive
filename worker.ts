import handler from "vinext/server/fetch-handler";

/** Apply policy to redirects and errors as well as rendered HTML. */
export default {
  async fetch(request, env, ctx) {
    const response = await handler.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    const path = new URL(request.url).pathname;
    const learn = path === "/learn" || path.startsWith("/learn/");
    headers.set(
      "X-Robots-Tag",
      "noindex, nofollow, noarchive, nosnippet, noimageindex, notranslate, noai, noimageai",
    );
    headers.set(
      "Content-Security-Policy",
      learn ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
    );
    if (
      learn ||
      path === "/dashboard" ||
      path.startsWith("/dashboard/") ||
      path === "/auth" ||
      path.startsWith("/auth/")
    ) {
      headers.set("Cache-Control", "private, no-store");
    }
    if (learn) {
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "no-referrer");
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
} satisfies ExportedHandler<Cloudflare.Env>;
