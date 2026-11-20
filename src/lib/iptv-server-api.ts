export type IptvServerConfig = {
  server_name: string;
  base_url: string;
  api_key: string;
};

export function normalizeIptvBaseUrl(raw: string): string {
  let url = (raw || "").trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, "");
}

export function buildIptvHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (apiKey) {
    const key = apiKey.trim();
    headers["X-API-Key"] = key;
    headers["Authorization"] = `Bearer ${key}`;
  }
  return headers;
}
