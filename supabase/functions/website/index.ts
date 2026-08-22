import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ORIGIN = "https://kajtwabmwbncfgvehqmm.supabase.co";
const STORAGE = `${ORIGIN}/storage/v1/object/public/media/site`;
// Supabase rewrites HTML from functions/storage to text/plain + a sandbox CSP,
// so browsers show source instead of the site. Send HTML to a renderer.
const HTML_HOST =
  "https://raw.githack.com/akwesibrain/Goods-Impotation/cursor/mwinbarka-imports-site-5d47/";

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  txt: "text/plain; charset=utf-8",
  json: "application/json",
  mp4: "video/mp4",
  webm: "video/webm",
};

function mime(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return TYPES[ext] || "application/octet-stream";
}

function resolvePath(pathname: string) {
  let rel = pathname;
  for (const marker of ["/functions/v1/website", "/website"]) {
    if (rel === marker || rel.startsWith(`${marker}/`)) {
      rel = rel.slice(marker.length);
      break;
    }
  }
  rel = decodeURIComponent(rel).replace(/^\/+/, "");
  if (!rel || rel.endsWith("/")) rel += "index.html";
  rel = rel.replaceAll("\\", "/").replaceAll("..", "");
  return rel;
}

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const rel = resolvePath(url.pathname);
  const type = mime(rel);

  if (type.startsWith("text/html")) {
    return Response.redirect(`${HTML_HOST}${rel}`, 302);
  }

  const upstream = await fetch(`${STORAGE}/${rel}`);
  if (!upstream.ok) {
    return new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const headers = new Headers();
  headers.set("content-type", type);
  headers.set("content-disposition", "inline");
  headers.set("x-content-type-options", "nosniff");
  headers.set("cache-control", "public, max-age=60");
  headers.set("access-control-allow-origin", "*");

  const body = req.method === "HEAD" ? null : await upstream.arrayBuffer();
  return new Response(body, { status: 200, headers });
});
