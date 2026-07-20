// Server-only Firebase Cloud Messaging (HTTP v1) sender using Web Crypto.
// Do not import at module scope of client-reachable files.

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

let cachedToken: { token: string; exp: number } | null = null;

function getServiceAccount(serviceAccountJson?: string): ServiceAccount {
  const raw = serviceAccountJson?.trim() || process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON não configurada");
  if (!raw.startsWith("{")) {
    throw new Error("Credencial do Firebase inválida. Cadastre o JSON completo da conta de serviço, não a chave VAPID.");
  }
  let parsed: ServiceAccount;
  try {
    parsed = JSON.parse(raw) as ServiceAccount;
  } catch {
    throw new Error("Credencial do Firebase inválida. O JSON da conta de serviço está malformado.");
  }
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("Credencial do Firebase incompleta. O JSON precisa conter project_id, client_email e private_key.");
  }
  return parsed;
}

function b64url(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof input === "string") bytes = new TextEncoder().encode(input);
  else if (input instanceof Uint8Array) bytes = input;
  else bytes = new Uint8Array(input);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const clean = pem.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(clean);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getAccessToken(serviceAccountJson?: string): Promise<string> {
  if (cachedToken && cachedToken.exp - 60 > Math.floor(Date.now() / 1000)) return cachedToken.token;
  const sa = getServiceAccount(serviceAccountJson);
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: sa.token_uri || "https://oauth2.googleapis.com/token",
    iat,
    exp,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(sig)}`;

  const resp = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`,
  });
  const data = (await resp.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!resp.ok || !data.access_token) throw new Error(`OAuth Google falhou: ${data.error_description || data.error || resp.status}`);
  cachedToken = { token: data.access_token, exp: iat + (data.expires_in || 3600) };
  return data.access_token;
}

export type SendPushInput = {
  tokens: string[];
  title: string;
  body: string;
  url?: string;
  data?: Record<string, string>;
  serviceAccountJson?: string;
};

export type SendPushResult = { success: number; failure: number; invalidTokens: string[] };

export async function sendPushToTokens(input: SendPushInput): Promise<SendPushResult> {
  const tokens = Array.from(new Set(input.tokens.filter(Boolean)));
  if (tokens.length === 0) return { success: 0, failure: 0, invalidTokens: [] };
  const sa = getServiceAccount(input.serviceAccountJson);
  const accessToken = await getAccessToken(input.serviceAccountJson);
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  let success = 0;
  let failure = 0;
  const invalid: string[] = [];

  // Batch with small concurrency
  const concurrency = 10;
  let i = 0;
  async function worker() {
    while (i < tokens.length) {
      const idx = i++;
      const token = tokens[idx];
      const payload = {
        message: {
          token,
          notification: { title: input.title, body: input.body },
          webpush: {
            notification: { title: input.title, body: input.body, icon: "/portal-icon-192.png", badge: "/portal-icon-192.png" },
            fcm_options: input.url ? { link: input.url } : undefined,
          },
          data: { ...(input.data || {}), ...(input.url ? { url: input.url } : {}) },
        },
      };
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (r.ok) {
          success++;
        } else {
          failure++;
          const err = (await r.json().catch(() => ({}))) as { error?: { status?: string; message?: string } };
          const status = err.error?.status || "";
          if (status === "NOT_FOUND" || status === "UNREGISTERED" || status === "INVALID_ARGUMENT") {
            invalid.push(token);
          }
        }
      } catch {
        failure++;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tokens.length) }, worker));

  return { success, failure, invalidTokens: invalid };
}
