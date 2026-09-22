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
