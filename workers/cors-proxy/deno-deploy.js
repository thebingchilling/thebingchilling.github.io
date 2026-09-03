/* ═══════════════════════════════════════════════════════════════════════
   Bingqilin CORS proxy — Deno Deploy port.

   Same proxy as worker.js (the Cloudflare Workers version — see that file
   for the full write-up of what this does and why), ported to Deno.serve
   for testing on a different network than Cloudflare's. Worth trying if a
   target blocks the Cloudflare-hosted version specifically: Cloudflare
   Workers requests come from Cloudflare's own edge IPs, which is an easy
   "this can't be a real visitor" signal for any site that's itself behind
   Cloudflare — a request from Deno Deploy's network doesn't carry that
   particular tell.

   Usage from the browser (identical to the Cloudflare version):
     GET  <this deployment's URL>/?url=<encoded target URL>
     POST <this deployment's URL>/?url=<encoded target URL>   (body forwarded as-is)

   See README.md in this directory for how to deploy this on Deno Deploy
   (no command line needed) and how to test it.
   ═══════════════════════════════════════════════════════════════════════ */

const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST"]);

// Looks like an ordinary desktop browser rather than announcing itself —
// see worker.js for why this matters.
const PROXY_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

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

// Basic SSRF guard — see worker.js for the rationale (this is an open
// relay by design, so it only blocks the obviously-not-a-public-API cases).
function isBlockedHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local")) return true;
  if (/^127\.|^0\.|^10\.|^169\.254\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd")) return true;
  return false;
}

Deno.serve(async (request) => {
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
});
