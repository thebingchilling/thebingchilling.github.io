/* ═══════════════════════════════════════════════════════════════════════
   Bingqilin CORS proxy — Vercel Edge Function, mirrors workers/cors-proxy/
   worker.js exactly (same logic, same Web-standard Request/Response APIs —
   only the export shape differs between the two platforms).

   This is a second, independent proxy, not a replacement for the Cloudflare
   Worker. It exists because apibay.org rate-limits by source IP, and
   Cloudflare Workers all share one massive egress IP pool — so the Worker
   can get throttled by traffic from completely unrelated Workers hitting
   apibay from that same shared range, with nothing to do with this site's
   own usage. Vercel Edge Functions run on a genuinely different network,
   so this gives a real second path when that happens, rather than a
   guess at a different provider.

   Usage from the browser (identical contract to the Worker):
     GET  <this function's URL>/api/proxy?url=<encoded target URL>
     POST <this function's URL>/api/proxy?url=<encoded target URL>   (body forwarded as-is)

   See README.md in this directory for how to deploy this.
   ═══════════════════════════════════════════════════════════════════════ */

export const config = { runtime: "edge" };

const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST"]);

// Reddit (and some other APIs) reject or heavily rate-limit requests that
// carry a blank User-Agent, and some WAFs (possibly including whatever
// fronts saucenao.com) specifically block anything self-identifying as a
// bot/proxy/library — so this looks like an ordinary desktop browser
// rather than announcing itself, for every proxied request.
const PROXY_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    // The CORS spec carves Authorization out of the "*" wildcard on
    // purpose — it must always be named explicitly, wildcard or not, or
    // the browser's preflight refuses to let the real request send it at
    // all. Reddit's OAuth calls (Basic for the token exchange, Bearer for
    // the gallery fetch) both depend on this header reaching the function,
    // so without this the forwarded-Authorization fix downstream never
    // gets a chance to run.
    //
    // Spelled out as a plain list rather than mixed with "*" — some
    // WebKit/Safari versions (notably iOS, where this broke while working
    // fine in desktop Chrome) parse a combined "*, Authorization" value
    // more strictly and don't treat it as covering Authorization at all.
    // An explicit list has no such ambiguity in any browser.
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    // Response headers are invisible to cross-origin JS unless listed
    // here explicitly — X-Final-Url carries the post-redirect URL (see
    // its use below) and would otherwise silently read back empty.
    "Access-Control-Expose-Headers": "X-Final-Url",
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

export default async function handler(request) {
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
  fwdHeaders.set("Accept", request.headers.get("Accept") || "*/*");
  fwdHeaders.set("Accept-Language", "en-US,en;q=0.9");
  fwdHeaders.set("User-Agent", PROXY_USER_AGENT);
  // Forwarded as-is (Basic for Reddit's token exchange, Bearer for its
  // API calls) — the caller decides what goes in it, this just passes
  // it through instead of silently dropping it.
  const auth = request.headers.get("Authorization");
  if (auth) fwdHeaders.set("Authorization", auth);

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
  // upstream.url is the final URL after following any redirects (e.g.
  // Reddit's mobile-app share links, …/s/<token>, redirect to the real
  // post) — exposed so callers that need to resolve a redirect rather
  // than just read its body (see saucenao's resolveShareLink) can do so
  // without a second request.
  outHeaders.set("X-Final-Url", upstream.url);

  return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
}
