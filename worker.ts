import handler from "vinext/server/fetch-handler";
/** Apply policy to redirects and errors as well as rendered HTML. */
export default {
  async fetch(request: Request, env, ctx) {
    // run_worker_first applies response policy to static files as well.
    // Vinext expects the asset layer to have served matching files already.
    let assetResponse: Response | undefined;
    if (request.method === "GET" || request.method === "HEAD") {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) assetResponse = asset;
      else await asset.body?.cancel();
    }
    const response: Response =
      assetResponse ?? (await handler.fetch(request, env, ctx));
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
    // Cloudflare assets default to max-age=0: every revisit otherwise asks
    // this Worker to revalidate unchanged files. Cache only actual successful
    // assets privately for a fixed lifetime.
    if (assetResponse && (response.status === 200 || response.status === 304)) {
      const maxAge = path.startsWith("/_next/static/") ? 3600 : 300;
      headers.set(
        "Cache-Control",
        `private, max-age=${maxAge}, must-revalidate`,
      );
      // The asset's upstream Age/Date must not shorten or extend this policy.
      headers.delete("Age");
      headers.delete("Expires");
      headers.set("Date", new Date().toUTCString());
    }
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
