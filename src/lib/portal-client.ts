const TOKEN_KEY = "portal_token";
const PORTAL_API_ORIGIN = "https://painelvipajp.lovable.app";

function getPortalApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (typeof window === "undefined") return path;
  if (window.location.hostname === "ajpvip.com.br" || window.location.hostname === "www.ajpvip.com.br") {
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
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(getPortalApiUrl(path), { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new PortalFetchError((body as { error?: string }).error || `HTTP ${res.status}`, res.status);
  return body as T;
}
