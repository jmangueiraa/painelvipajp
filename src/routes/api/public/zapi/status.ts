import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type ZapiStatusBody = { connected?: boolean; smartphoneConnected?: boolean; error?: string };

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}

async function requireUser(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });

  const supabase = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return json({ error: "Sessão inválida. Entre novamente." }, { status: 401 });
  return null;
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

export const Route = createFileRoute("/api/public/zapi/status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await requireUser(request);
        if (unauthorized) return unauthorized;

        try {
          const { url, headers } = zapiBase();
          const res = await fetch(`${url}/status`, { headers });
          const body = (await res.json().catch(() => ({}))) as ZapiStatusBody;
          return json({ configured: true, connected: Boolean(body.connected || body.smartphoneConnected), raw: body });
        } catch (error) {
          return json({ configured: false, connected: false, raw: { error: (error as Error).message } });
        }
      },
    },
  },
});