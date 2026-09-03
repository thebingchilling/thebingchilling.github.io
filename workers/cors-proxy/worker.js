/* ═══════════════════════════════════════════════════════════════════════
   Bingqilin CORS proxy — a small, generic Cloudflare Worker.

   GitHub Pages can't run a server, so a handful of tools in this toolbox
   (SauceNAO + Reddit lookups in the reverse-image-search tool, arbitrary
   indexer APIs in the torrent search tool) need somewhere else to make
   the actual request when the target doesn't send CORS headers of its
   own. This Worker is that somewhere else: it fetches whatever URL it's
   given, server-side, and hands the response back with CORS headers that
   let the browser read it.

   Usage from the browser:
     GET  <this worker's URL>/?url=<encoded target URL>
     POST <this worker's URL>/?url=<encoded target URL>   (body forwarded as-is)

   Deliberately generic — no per-site special-casing beyond the User-Agent
   nudge below, which a couple of targets (Reddit, notably) require. See
   README.md in this directory for how to deploy this and wire it into
   the tools.
   ═══════════════════════════════════════════════════════════════════════ */

const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST"]);

// Reddit (and some other APIs) reject or heavily rate-limit requests that
// carry a blank or generic User-Agent — this replaces whatever the runtime
// would otherwise send, for every proxied request, since it's harmless for
// targets that don't care and fixes the ones that do.
const PROXY_USER_AGENT = "Mozilla/5.0 (compatible; BingqilinToolboxProxy/1.0; +https://thebingchilling.github.io)";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function textResponse(body, status, origin) {
  return new Response(body, { status, headers: { ...corsHeaders(origin), "Content-Type": "text/plain; charset=utf-8" } });
}

// Basic SSRF guard — this is an open relay by design (any source URL a
// visitor configures in the torrent search tool needs to work), so this
// only blocks the obviously-not-a-public-API cases: loopback, link-local,
// and private network ranges.
function isBlockedHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local")) return true;
  if (/^127\.|^0\.|^10\.|^169\.254\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd")) return true;
  return false;
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (!ALLOWED_METHODS.has(request.method)) {
      return textResponse("Method not allowed.", 405, origin);
    }

    const reqUrl = new URL(request.url);
    const target = reqUrl.searchParams.get("url");
    if (!target) {
      return textResponse("Missing ?url= parameter.", 400, origin);
    }

    let targetUrl;
    try { targetUrl = new URL(target); } catch (e) {
      return textResponse("That's not a valid URL.", 400, origin);
    }
    if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
      return textResponse("Only http/https targets are allowed.", 400, origin);
    }
    if (isBlockedHost(targetUrl.hostname)) {
      return textResponse("That host isn't allowed.", 403, origin);
    }

    const fwdHeaders = new Headers();
    const contentType = request.headers.get("Content-Type");
    if (contentType) fwdHeaders.set("Content-Type", contentType);
    const accept = request.headers.get("Accept");
    if (accept) fwdHeaders.set("Accept", accept);
    fwdHeaders.set("User-Agent", PROXY_USER_AGENT);

    const hasBody = request.method !== "GET" && request.method !== "HEAD";

    let upstream;
    try {
      upstream = await fetch(targetUrl.toString(), {
        method: request.method,
        headers: fwdHeaders,
        body: hasBody ? await request.arrayBuffer() : undefined,
        redirect: "follow",
      });
    } catch (err) {
      return textResponse("Upstream fetch failed: " + (err && err.message), 502, origin);
    }

    const outHeaders = new Headers(corsHeaders(origin));
    const upstreamContentType = upstream.headers.get("Content-Type");
    if (upstreamContentType) outHeaders.set("Content-Type", upstreamContentType);

    return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
  },
};
