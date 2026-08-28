const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if (LOCAL_HOSTS.has(url.hostname)) return true;
    if (url.protocol !== "https:") return false;
    if (url.hostname === "goods-impotation.vercel.app") return true;
    return /^goods-impotation[-.].+\.vercel\.app$/.test(url.hostname);
  } catch {
    return false;
  }
}

export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  if (isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}
