import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type ZapiStatusBody = { connected?: boolean; smartphoneConnected?: boolean; error?: string };
type ZapiQrBody = { value?: string; error?: string };

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

async function requireUser(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return { ok: false as const, response: json({ error: "Sessão expirada. Entre novamente." }, { status: 401 }) };

  const supabase = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return { ok: false as const, response: json({ error: "Sessão inválida. Entre novamente." }, { status: 401 }) };
  return { ok: true as const };
}

function zapiBase() {
  const instance = process.env.Z_API_INSTANCE_ID;
  const token = process.env.Z_API_TOKEN;
  if (!instance || !token) throw new Error("Credenciais Z-API ausentes");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const clientToken = process.env.Z_API_CLIENT_TOKEN;
  if (clientToken) headers["Client-Token"] = clientToken;

  return { url: `https://api.z-api.io/instances/${instance}/token/${token}`, headers };
}

async function readJson<T>(response: Response): Promise<T> {
  return response.json().catch(() => ({} as T));
}

export const Route = createFileRoute("/api/zapi/$action")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await requireUser(request);
        if (!user.ok) return user.response;

        try {
          const { url, headers } = zapiBase();

          if (params.action === "status") {
            const res = await fetch(`${url}/status`, { headers });
            const body = await readJson<ZapiStatusBody>(res);
            return json({
              configured: true,
              connected: Boolean(body.connected || body.smartphoneConnected),
              raw: body,
            });
          }

          if (params.action === "qr") {
            const statusRes = await fetch(`${url}/status`, { headers });
            const statusBody = await readJson<ZapiStatusBody>(statusRes);
            if (statusBody.connected || statusBody.smartphoneConnected) return json({ connected: true, image: null });

            const qrRes = await fetch(`${url}/qr-code/image`, { headers });
            const qrBody = await readJson<ZapiQrBody>(qrRes);
            if (!qrRes.ok || !qrBody.value) {
              return json({ error: qrBody.error || `Falha ao obter QR Code (HTTP ${qrRes.status})` }, { status: 502 });
            }

            const image = qrBody.value.startsWith("data:") ? qrBody.value : `data:image/png;base64,${qrBody.value}`;
            return json({ connected: false, image });
          }

          return json({ error: "Ação inválida" }, { status: 404 });
        } catch (error) {
          return json({ configured: false, connected: false, error: (error as Error).message }, { status: 500 });
        }
      },
      POST: async ({ request, params }) => {
        const user = await requireUser(request);
        if (!user.ok) return user.response;

        if (params.action !== "disconnect") return json({ error: "Ação inválida" }, { status: 404 });

        try {
          const { url, headers } = zapiBase();
          const res = await fetch(`${url}/disconnect`, { method: "GET", headers });
          if (!res.ok) return json({ error: `Falha ao desconectar (HTTP ${res.status})` }, { status: 502 });
          return json({ ok: true });
        } catch (error) {
          return json({ error: (error as Error).message }, { status: 500 });
        }
      },
    },
  },
});