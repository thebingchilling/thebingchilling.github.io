/*
 * Ad-strip proxy for third-party video embeds.
 *
 * Fetches an embed URL server-side (so it can spoof Referer/Origin/User-Agent
 * headers the way the embed provider's own site would), strips <script> tags
 * from a short list of known ad-network domains, and injects a shim that
 * neutralizes window.open()/window.top redirects before the page's own
 * scripts run. Serves the result from this worker's origin so the frontend
 * can point its <iframe> at it directly, without the sandbox attribute.
 *
 * THIS IS A GENERIC, UNTESTED-AGAINST-ANY-SPECIFIC-PROVIDER FIRST PASS.
 * Embed providers change their markup/obfuscation regularly and some
 * detect proxying outright (token/signature checks, IP checks, etc.) — this
 * will need iteration against whatever source you actually point it at, and
 * may simply not work against sources that validate more than Referer/Origin.
 *
 * Deploy: wrangler.toml in this folder, `wrangler deploy` from here.
 * Usage:  https://<your-worker>.workers.dev/?url=<encodeURIComponent(embedUrl)>
 */

// Optional allowlist of hostnames this proxy will fetch. Leave empty to allow
// any HTTPS URL (open proxy — anyone who finds your worker URL can use it to
// fetch arbitrary sites through it). Filling this in is strongly recommended
// once you know which embed provider(s) you're actually using.
const ALLOWED_HOSTS = [
  // "example-embed-provider.com",
];

// <script src> hosts to drop outright. Small and conservative on purpose —
// broad substring heuristics (matching on "ads"/"banner"/etc.) tend to catch
// legitimate player scripts too. This list will not catch first-party ad
// code served from the embed provider's own domain; the window.open/top
// shim below is the main defense against that.
const AD_SCRIPT_HOSTS = [
  "doubleclick.net",
  "googlesyndication.com",
  "google-analytics.com",
  "googletagmanager.com",
  "popads.net",
  "propellerads.com",
  "adsterra.com",
  "exoclick.com",
  "juicyads.com",
  "hilltopads.net",
  "revenuehits.com",
  "adcash.com",
  "clickadu.com",
  "mgid.com",
  "taboola.com",
  "outbrain.com",
];

const SHIM_SCRIPT = `
(function () {
  try {
    var fakeWin = {
      closed: false, focus: function () {}, close: function () {}, blur: function () {},
      postMessage: function () {}, location: { href: "" },
    };
    window.open = function () { return fakeWin; };
  } catch (e) {}
  try {
    Object.defineProperty(window, "top", { get: function () { return window; }, configurable: true });
    Object.defineProperty(window, "parent", { get: function () { return window; }, configurable: true });
  } catch (e) {}
  try {
    window.alert = function () {};
    window.confirm = function () { return false; };
  } catch (e) {}
})();
`;

function hostAllowed(hostname, list) {
  if (!list.length) return true;
  return list.some((h) => hostname === h || hostname.endsWith("." + h));
}

class ShimInjector {
  element(el) {
    el.prepend(`<script>${SHIM_SCRIPT}</script>`, { html: true });
  }
}

class BaseTagInjector {
  constructor(baseHref) {
    this.baseHref = baseHref;
  }
  element(el) {
    el.prepend(`<base href="${this.baseHref}">`, { html: true });
  }
}

class AdScriptStripper {
  element(el) {
    const src = el.getAttribute("src");
    if (!src) return;
    let hostname;
    try {
      hostname = new URL(src, "https://placeholder.invalid/").hostname;
    } catch (e) {
      return;
    }
    if (AD_SCRIPT_HOSTS.some((h) => hostname === h || hostname.endsWith("." + h))) {
      el.remove();
    }
  }
}

export default {
  async fetch(request) {
    const reqUrl = new URL(request.url);
    const target = reqUrl.searchParams.get("url");

    if (!target) {
      return new Response("Missing ?url= parameter.", { status: 400 });
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch (e) {
      return new Response("Invalid url parameter.", { status: 400 });
    }

    if (targetUrl.protocol !== "https:") {
      return new Response("Only https:// targets are allowed.", { status: 400 });
    }

    if (!hostAllowed(targetUrl.hostname, ALLOWED_HOSTS)) {
      return new Response("Target host is not on the allowlist.", { status: 403 });
    }

    const upstreamReq = new Request(targetUrl.toString(), {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        // Spoofed to the target's own origin — defeats providers that only
        // check "did this request come from our own site".
        Referer: targetUrl.origin + "/",
        Origin: targetUrl.origin,
      },
    });

    let upstreamResp;
    try {
      upstreamResp = await fetch(upstreamReq);
    } catch (e) {
      return new Response("Upstream fetch failed: " + e.message, { status: 502 });
    }

    const contentType = upstreamResp.headers.get("content-type") || "";
    const headers = new Headers(upstreamResp.headers);
    headers.delete("x-frame-options");
    headers.delete("content-security-policy");
    headers.delete("content-security-policy-report-only");
    headers.set("Cache-Control", "no-store");
    headers.set("Access-Control-Allow-Origin", "*");

    if (!contentType.includes("text/html")) {
      // Non-HTML resource (image, font, etc.) requested directly — just relay it.
      return new Response(upstreamResp.body, { status: upstreamResp.status, headers });
    }

    const dirHref = targetUrl.origin + targetUrl.pathname.replace(/[^/]*$/, "");

    const rewritten = new HTMLRewriter()
      .on("head", new BaseTagInjector(dirHref))
      .on("head", new ShimInjector())
      .on("script[src]", new AdScriptStripper())
      .transform(upstreamResp);

    return new Response(rewritten.body, { status: upstreamResp.status, headers });
  },
};
