const ALLOWED_PORTAL_ORIGINS = new Set([
  "https://painelvipajp.lovable.app",
  "https://ajpvip.com.br",
  "https://www.ajpvip.com.br",
]);

export function portalCorsHeaders(request?: Request): Record<string, string> {
  const origin = request?.headers.get("origin") ?? "";
  const allowOrigin = ALLOWED_PORTAL_ORIGINS.has(origin) ? origin : "https://painelvipajp.lovable.app";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Portal-Origin, Accept, Origin",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function portalOptions(request: Request): Response {
  return new Response(null, { status: 204, headers: portalCorsHeaders(request) });
}
