/* ═══════════════════════════════════════════════════════════════════════
   Bingqilin CORS proxy — plain Node.js port.

   Same proxy as ../worker.js (the Cloudflare Workers version — see that
   file for the full write-up), rewritten as a plain Node http server for
   hosting anywhere that runs Node (Render, Railway, a VPS, ...) instead
   of a serverless/edge platform. Worth trying if a target blocks the
   Cloudflare-hosted version specifically, or if signing up for a
   serverless platform isn't working out — this only needs an ordinary
   Node host.

   No dependencies beyond Node itself (18+, for the built-in fetch/Headers/
   URL globals).

   Usage from the browser (identical to the other versions):
     GET  <this server's URL>/?url=<encoded target URL>
     POST <this server's URL>/?url=<encoded target URL>   (body forwarded as-is)

   See README.md in the parent directory for deploy instructions (Render,
   specifically, since it can run this straight from this GitHub repo with
   no local setup) and how to test it.
   ═══════════════════════════════════════════════════════════════════════ */

const http = require("http");

const PORT = process.env.PORT || 3000;
const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST"]);

// Looks like an ordinary desktop browser rather than announcing itself —
// see ../worker.js for why this matters.
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

// Basic SSRF guard — see ../worker.js for the rationale (this is an open
// relay by design, so it only blocks the obviously-not-a-public-API cases).
function isBlockedHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local")) return true;
  if (/^127\.|^0\.|^10\.|^169\.254\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd")) return true;
  return false;
}

function sendText(res, status, origin, body) {
  res.writeHead(status, { ...corsHeaders(origin), "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers["origin"] || "*";
  const method = req.method || "GET";

  if (method === "OPTIONS") {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }
  if (!ALLOWED_METHODS.has(method)) {
    sendText(res, 405, origin, "Method not allowed.");
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const target = reqUrl.searchParams.get("url");
  if (!target) {
    sendText(res, 400, origin, "Missing ?url= parameter.");
    return;
  }

  let targetUrl;
  try { targetUrl = new URL(target); } catch (e) {
    sendText(res, 400, origin, "That's not a valid URL.");
    return;
  }
  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    sendText(res, 400, origin, "Only http/https targets are allowed.");
    return;
  }
  if (isBlockedHost(targetUrl.hostname)) {
    sendText(res, 403, origin, "That host isn't allowed.");
    return;
  }

  const fwdHeaders = {
    "Accept": req.headers["accept"] || "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": PROXY_USER_AGENT,
  };
  if (req.headers["content-type"]) fwdHeaders["Content-Type"] = req.headers["content-type"];

  const hasBody = method !== "GET" && method !== "HEAD";
  const body = hasBody ? await readBody(req) : undefined;

  let upstream;
  try {
    upstream = await fetch(targetUrl.toString(), {
      method,
      headers: fwdHeaders,
      body,
      redirect: "follow",
    });
  } catch (err) {
    sendText(res, 502, origin, "Upstream fetch failed: " + (err && err.message));
    return;
  }

  const outHeaders = { ...corsHeaders(origin) };
  const upstreamContentType = upstream.headers.get("content-type");
  if (upstreamContentType) outHeaders["Content-Type"] = upstreamContentType;

  res.writeHead(upstream.status, outHeaders);
  res.end(Buffer.from(await upstream.arrayBuffer()));
});

server.listen(PORT, () => {
  console.log(`Bingqilin CORS proxy listening on port ${PORT}`);
});
