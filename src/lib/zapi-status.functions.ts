import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function zapiBase() {
  const instance = process.env.Z_API_INSTANCE_ID;
  const token = process.env.Z_API_TOKEN;
  if (!instance || !token) throw new Error("Z-API não configurada (defina Z_API_INSTANCE_ID e Z_API_TOKEN nos secrets)");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const clientToken = process.env.Z_API_CLIENT_TOKEN;
  if (clientToken) headers["Client-Token"] = clientToken;
  return { url: `https://api.z-api.io/instances/${instance}/token/${token}`, headers };
}

export const getZapiStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    try {
      const { url, headers } = zapiBase();
      const res = await fetch(`${url}/status`, { headers });
      const body = (await res.json().catch(() => ({}))) as { connected?: boolean; smartphoneConnected?: boolean; error?: string };
      return {
        configured: true,
        connected: Boolean(body.connected || body.smartphoneConnected),
        raw: body,
      };
    } catch (e) {
      return { configured: false, connected: false, raw: { error: (e as Error).message } };
    }
  });

export const getZapiQrCode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { url, headers } = zapiBase();
    // First check status — if already connected, no QR needed
    const st = await fetch(`${url}/status`, { headers }).then((r) => r.json()).catch(() => ({} as { connected?: boolean }));
    if (st?.connected) return { connected: true, image: null as string | null };

    const res = await fetch(`${url}/qr-code/image`, { headers });
    const body = (await res.json().catch(() => ({}))) as { value?: string; error?: string };
    if (!res.ok || !body.value) {
      throw new Error(body.error || `Falha ao obter QR Code (HTTP ${res.status})`);
    }
    const image = body.value.startsWith("data:") ? body.value : `data:image/png;base64,${body.value}`;
    return { connected: false, image };
  });

export const disconnectZapi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { url, headers } = zapiBase();
    const res = await fetch(`${url}/disconnect`, { method: "GET", headers });
    if (!res.ok) throw new Error(`Falha ao desconectar (HTTP ${res.status})`);
    return { ok: true };
  });
