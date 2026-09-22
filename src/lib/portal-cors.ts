const ALLOWED_PORTAL_ORIGINS = new Set([
  "https://painelvipajp.lovable.app",
  "https://ajpvip.com.br",
  "https://www.ajpvip.com.br",
  "https://portal.ajpstore.com.br",
  "https://ajpstore.com.br",
  "https://www.ajpstore.com.br",
  "https://portalajp.com.br",
  "https://www.portalajp.com.br",
]);

export function isAllowedPortalOrigin(origin: string): boolean {
  if (!origin) return false;
  if (ALLOWED_PORTAL_ORIGINS.has(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.portalajp\.com\.br$/i.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.ajpstore\.com\.br$/i.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.ajpvip\.com\.br$/i.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.lovable\.app$/i.test(origin)) return true;
  return false;
}

export function portalCorsHeaders(request?: Request): Record<string, string> {
  const origin = request?.headers.get("origin") ?? "";
  const allowOrigin = isAllowedPortalOrigin(origin) ? origin : "https://painelvipajp.lovable.app";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Portal-Origin, X-Portal-Token, Accept, Origin, Cache-Control",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function portalOptions(request: Request): Response {
  return new Response(null, { status: 204, headers: portalCorsHeaders(request) });
}
