import handler from "vinext/server/fetch-handler";
import { accessClosedResponse, isAccessOpen } from "./src/lib/access-hours";

/** Apply policy to redirects and errors as well as rendered HTML. */
export default {
  async fetch(request: Request, env, ctx) {
    if (process.env.NODE_ENV === "production" && !isAccessOpen()) {
      return accessClosedResponse(request);
    }
    // run_worker_first keeps the access-hours policy ahead of static files.
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
