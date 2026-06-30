import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function zapiBase() {
  let instance = process.env.Z_API_INSTANCE_ID;
  let token = process.env.Z_API_TOKEN;
  let clientToken = process.env.Z_API_CLIENT_TOKEN;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("settings")
      .select("zapi_instance_id,zapi_token,zapi_client_token")
      .limit(1)
      .maybeSingle();
    if (data?.zapi_instance_id) instance = data.zapi_instance_id;
    if (data?.zapi_token) token = data.zapi_token;
    if (data?.zapi_client_token) clientToken = data.zapi_client_token;
  } catch { /* ignore */ }
  if (!instance || !token) throw new Error("Z-API não configurada (cadastre em Cadastrar API)");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
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
