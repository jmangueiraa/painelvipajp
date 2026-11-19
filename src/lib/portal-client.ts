const TOKEN_KEY = "portal_token";
const PORTAL_API_ORIGIN = "https://painelvipajp.lovable.app";

function isCustomPortalDomain(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return (
    host === "ajpvip.com.br" ||
    host === "www.ajpvip.com.br" ||
    host === "portal.ajpstore.com.br" ||
    host === "ajpstore.com.br" ||
    host === "www.ajpstore.com.br" ||
    host === "portalajp.com.br" ||
    host === "www.portalajp.com.br" ||
    host.endsWith(".portalajp.com.br") ||
    host.endsWith(".ajpstore.com.br") ||
    host.endsWith(".ajpvip.com.br")
  );
}

function getPortalApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (typeof window === "undefined") return path;
  if (isCustomPortalDomain()) {
    return `${PORTAL_API_ORIGIN}${path}`;
  }
  return path;
}

export function getPortalToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setPortalToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearPortalToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem("portal_cached_me");
}

export class PortalFetchError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type RefreshResult = {
  ok: boolean;
  token?: string;
  fatal?: boolean;
  error?: string;
};

/**
 * Renovação silenciosa da sessão do usuário:
 * 1. Renova supabase.auth se houver sessão auth ativa.
 * 2. Renova o token de sessão do cliente (/api/public/portal/refresh-session).
 * Nunca desloga em erros transitórios de conexão/rede; apenas em caso de token revogado/inválido (401/403 fatal).
 */
export async function silentRefreshSession(): Promise<RefreshResult> {
  const token = getPortalToken();
  if (!token) {
    return { ok: false, fatal: true, error: "no_token" };
  }

  // 1. Tenta renovar a sessão Supabase se existir
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    if (data?.session) {
      await supabase.auth.refreshSession().catch((e) => {
        console.warn("[portal-client] supabase.auth.refreshSession warning:", e);
      });
    }
  } catch (authErr) {
    console.warn("[portal-client] supabase.auth silent refresh warning:", authErr);
  }

  // 2. Renova a sessão do Portal VIP
  try {
    const res = await portalFetch<{ ok: boolean; token?: string; error?: string; fatal?: boolean }>(
      "/api/public/portal/refresh-session",
      {
        method: "POST",
        body: JSON.stringify({ token }),
      }
    );

    if (res?.ok) {
      if (res.token && res.token !== token) {
        setPortalToken(res.token);
      }
      return { ok: true, token: res.token || token };
    }

    if (res?.fatal) {
      return { ok: false, fatal: true, error: res.error || "invalid_session" };
    }

    return { ok: true, token };
  } catch (err) {
    if (err instanceof PortalFetchError && (err.status === 401 || err.status === 403)) {
      return { ok: false, fatal: true, error: err.message };
    }
    // Em caso de falha de rede temporária ou 500, NÃO desloga o usuário!
    console.warn("[portal-client] Falha transitória ao renovar sessão (mantendo login local):", err);
    return { ok: true, token };
  }
}

export async function portalFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = getPortalToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (isCustomPortalDomain()) headers["X-Portal-Origin"] = window.location.origin;
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    headers["X-Portal-Token"] = token;
  }

  const targetUrl = getPortalApiUrl(path);
  let res: Response;
  try {
    res = await fetch(targetUrl, { ...init, headers });
  } catch (err) {
    if (targetUrl !== path) {
      try {
        res = await fetch(path, { ...init, headers });
      } catch {
        throw err;
      }
    } else {
      throw err;
    }
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (targetUrl !== path && res.status >= 500) {
      try {
        const localRes = await fetch(path, { ...init, headers });
        const localBody = await localRes.json().catch(() => ({}));
        if (localRes.ok) return localBody as T;
      } catch {
        // fallback
      }
    }
    throw new PortalFetchError((body as { error?: string }).error || `HTTP ${res.status}`, res.status);
  }
  return body as T;
}
