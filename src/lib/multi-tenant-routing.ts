/**
 * Módulo de Roteamento Multi-Tenant e Subdomínios Reservados
 * 
 * Subdomínios reservados (ex: portal, www, admin, api, app) não devem ser tratados como lojas
 * de clientes e nunca devem consultar a tabela de lojas/configurações.
 */

export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "portal",
  "admin",
  "api",
  "app",
  "mail",
  "loja",
  "painel",
  "painelvipajp",
]);

/**
 * Extrai o subdomínio de um hostname (ex: "portal.ajpstore.com.br" -> "portal")
 */
export function extractSubdomain(hostname: string): string | null {
  if (!hostname) return null;
  const host = hostname.toLowerCase().split(":")[0].trim();

  // Tratamento direto para portal em domínios conhecidos
  if (
    host === "portal.ajpstore.com.br" ||
    host === "portal.ajpvip.com.br" ||
    host.startsWith("portal.")
  ) {
    return "portal";
  }

  // Domínios base conhecidos
  const knownBases = [
    "ajpstore.com.br",
    "ajpvip.com.br",
    "lovable.app",
    "lovableproject.com",
  ];

  for (const base of knownBases) {
    if (host.endsWith("." + base)) {
      const sub = host.slice(0, -(base.length + 1)).split(".").pop();
      if (sub) return sub;
    }
  }

  // Extração genérica baseada em partes do domínio
  const parts = host.split(".");
  if (host.endsWith(".com.br") && parts.length >= 4) {
    return parts[0];
  } else if (!host.endsWith(".com.br") && parts.length >= 3) {
    return parts[0];
  }

  return null;
}

/**
 * Verifica se um subdomínio é reservado/ignorado para criação e busca de lojas.
 */
export function isReservedSubdomain(subdomain?: string | null): boolean {
  if (!subdomain) return true;
  const clean = subdomain.toLowerCase().trim();
  return RESERVED_SUBDOMAINS.has(clean);
}

/**
 * Verifica se o hostname pertence ao Portal do Cliente.
 */
export function isPortalHostname(hostname: string): boolean {
  if (!hostname) return false;
  const host = hostname.toLowerCase().split(":")[0].trim();
  return (
    host === "portal.ajpstore.com.br" ||
    host === "portal.ajpvip.com.br" ||
    host.startsWith("portal.")
  );
}

/**
 * Intercepta requisições HTTP para aplicar redirecionamento multi-tenant correto.
 * Retorna uma Response de redirecionamento quando aplicável, ou null para continuar.
 */
export function handleMultiTenantRouting(request: Request): Response | null {
  try {
    const url = new URL(request.url);
    const rawHost =
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      url.hostname;
    const host = (rawHost || "").toLowerCase().split(":")[0].trim();
    const subdomain = extractSubdomain(host);
    const pathname = url.pathname;

    const isPortalRequest =
      isPortalHostname(host) ||
      subdomain === "portal" ||
      pathname === "/loja/portal" ||
      pathname.startsWith("/loja/portal/");

    if (isPortalRequest) {
      // 1. Se veio em /loja/portal (por reescrita de proxy ou link legado), redireciona direto para /portal
      if (pathname === "/loja/portal" || pathname === "/loja/portal/") {
        const dest = new URL("/portal", request.url);
        dest.search = url.search;
        return Response.redirect(dest.toString(), 302);
      }

      // 2. Se a requisição veio diretamente no domínio do portal (portal.ajpstore.com.br)
      if (isPortalHostname(host) || subdomain === "portal") {
        if (pathname === "/" || pathname === "") {
          const dest = new URL("/portal", request.url);
          dest.search = url.search;
          return Response.redirect(dest.toString(), 302);
        }
        if (pathname === "/painel" || pathname === "/painel/") {
          const dest = new URL("/portal/painel", request.url);
          dest.search = url.search;
          return Response.redirect(dest.toString(), 302);
        }
        if (pathname === "/indique" || pathname === "/indique/") {
          const dest = new URL("/portal/indique", request.url);
          dest.search = url.search;
          return Response.redirect(dest.toString(), 302);
        }
        // Se no domínio do portal tentarem acessar qualquer /loja/..., redireciona para o portal
        if (pathname.startsWith("/loja/")) {
          const dest = new URL("/portal", request.url);
          dest.search = url.search;
          return Response.redirect(dest.toString(), 302);
        }
      }
    }

    // 3. Se for outro subdomínio (não reservado), é uma loja de cliente (ex: minhaloja.ajpstore.com.br)
    if (subdomain && !isReservedSubdomain(subdomain)) {
      if (pathname === "/" || pathname === "") {
        const dest = new URL(`/loja/${subdomain}`, request.url);
        dest.search = url.search;
        return Response.redirect(dest.toString(), 302);
      }
    }

    return null;
  } catch {
    return null;
  }
}
