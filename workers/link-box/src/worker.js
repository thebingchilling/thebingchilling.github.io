/* Bingqilin Link Box — a tiny standalone Worker, unrelated to the GitHub
   Pages deploy of the rest of this site. It's a personal scratchpad for
   media/live source links: store them here, edit them, hit Copy, then
   paste the link into the main site's own importer by hand. No sync back
   to the main site is attempted — see workers/link-box/README.md. */

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init && init.headers) },
  });
}

async function readBoxes(env) {
  const raw = await env.LINKS.get("boxes");
  return raw ? JSON.parse(raw) : [];
}

async function writeBoxes(env, boxes) {
  await env.LINKS.put("boxes", JSON.stringify(boxes));
}

function sanitizeKind(kind) {
  return kind === "live" ? "live" : "media";
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    const parts = url.pathname.split("/").filter(Boolean); // ["api", "items", ":id"?]
    if (parts[1] !== "items") return json({ error: "not found" }, { status: 404 });
    const id = parts[2];

    if (request.method === "GET" && !id) {
      return json(await readBoxes(env));
    }

    if (request.method === "POST" && !id) {
      let body;
      try { body = await request.json(); } catch (e) { return json({ error: "invalid json" }, { status: 400 }); }
      const title = String(body.title || "").slice(0, 200);
      const link = String(body.url || "").slice(0, 4000);
      if (!title && !link) return json({ error: "title or url required" }, { status: 400 });
      const box = { id: crypto.randomUUID(), kind: sanitizeKind(body.kind), title, url: link };
      const boxes = await readBoxes(env);
      boxes.push(box);
      await writeBoxes(env, boxes);
      return json(box, { status: 201 });
    }

    if (request.method === "PUT" && id) {
      let body;
      try { body = await request.json(); } catch (e) { return json({ error: "invalid json" }, { status: 400 }); }
      const boxes = await readBoxes(env);
      const box = boxes.find((b) => b.id === id);
      if (!box) return json({ error: "not found" }, { status: 404 });
      if (body.title !== undefined) box.title = String(body.title).slice(0, 200);
      if (body.url !== undefined) box.url = String(body.url).slice(0, 4000);
      if (body.kind !== undefined) box.kind = sanitizeKind(body.kind);
      await writeBoxes(env, boxes);
      return json(box);
    }

    if (request.method === "DELETE" && id) {
      const boxes = await readBoxes(env);
      const next = boxes.filter((b) => b.id !== id);
      if (next.length === boxes.length) return json({ error: "not found" }, { status: 404 });
      await writeBoxes(env, next);
      return json({ ok: true });
    }

    return json({ error: "method not allowed" }, { status: 405 });
  },
};
