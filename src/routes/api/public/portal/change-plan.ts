import { createFileRoute } from "@tanstack/react-router";
import { portalCorsHeaders, portalOptions } from "@/lib/portal-cors";

function json(data: unknown, request: Request, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...portalCorsHeaders(request),
      ...(init?.headers ?? {}),
    },
  });
}

// Conforme tela oficial do RBOYS (Imagem 2), são exatamente e apenas estas 3 opções:
export const RBOYS_CONTENT_PLANS = [
  { id: "COMPLETO SEM ADULTO", name: "COMPLETO SEM ADULTO" },
  { id: "COMPLETO", name: "COMPLETO" },
  { id: "Personalizado (selecionar pacotes)", name: "Personalizado (selecionar pacotes)" },
] as const;

export const Route = createFileRoute("/api/public/portal/change-plan")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => portalOptions(request),

      // GET: Retorna estritamente as 3 opções de plano do RBOYS e o plano atual do cliente
      GET: async ({ request }) => {
        try {
          const portal = await import("@/integrations/portal/session.server");
          const client = await portal.getSessionFromRequest(request);
          if (!client) {
            return json({ error: "Sessão inválida ou expirada." }, request, { status: 401 });
          }

          const login = (client.iptv_login || "").trim();
          if (!login) {
            return json(
              {
                ok: false,
                error: "Cliente não possui login do servidor cadastrado.",
                username: client.name,
                plans: RBOYS_CONTENT_PLANS,
              },
              request,
              { status: 400 }
            );
          }

          const ownerId = client.user_id;
          const { fetchServerClients } = await import("@/lib/iptv-server-api.server");

          let currentPlanName = "COMPLETO";

          try {
            const serverClientsRes = await fetchServerClients(ownerId);
            const serverClient = serverClientsRes.clients.find(
              (c) => c.username.trim().toLowerCase() === login.toLowerCase()
            );

            if (serverClient) {
              const raw = serverClient.raw || {};
              const rawPlan = String(
                serverClient.plan_name ??
                raw.plan ??
                raw.plan_name ??
                raw.package ??
                raw.package_name ??
                raw.plan?.name ??
                raw.package?.name ??
                ""
              ).toUpperCase();

              if (rawPlan.includes("SEM ADULTO")) {
                currentPlanName = "COMPLETO SEM ADULTO";
              } else if (rawPlan.includes("PERSONALIZADO")) {
                currentPlanName = "Personalizado (selecionar pacotes)";
              } else if (rawPlan.includes("COMPLETO")) {
                currentPlanName = "COMPLETO";
              }
            }
          } catch (e) {
            console.warn("[portal change-plan] fetchServerClients fallback:", e);
          }

          return json(
            {
              ok: true,
              username: login,
              client_name: client.name,
              current_plan_name: currentPlanName,
              plans: RBOYS_CONTENT_PLANS,
            },
            request
          );
        } catch (err: any) {
          console.error("[portal change-plan GET error]", err);
          return json({ error: err.message || "Falha ao carregar opções de plano." }, request, {
            status: 500,
          });
        }
      },

      // POST: Executa a troca de plano no servidor RBOYS sem alterar vencimento nem consumir créditos
      POST: async ({ request }) => {
        try {
          const portal = await import("@/integrations/portal/session.server");
          const client = await portal.getSessionFromRequest(request);
          if (!client) {
            return json({ error: "Sessão inválida ou expirada." }, request, { status: 401 });
          }

          const login = (client.iptv_login || "").trim();
          if (!login) {
            return json(
              { error: "Cliente não possui credenciais do servidor IPTV configuradas." },
              request,
              { status: 400 }
            );
          }

          const body = (await request.json().catch(() => ({}))) as {
            plan_id?: string;
            plan_name?: string;
          };

          const rawSelected = String(body.plan_name || body.plan_id || "").trim();
          let targetPlanName: string = "COMPLETO";

          if (rawSelected.toUpperCase().includes("SEM ADULTO")) {
            targetPlanName = "COMPLETO SEM ADULTO";
          } else if (rawSelected.toUpperCase().includes("PERSONALIZADO")) {
            targetPlanName = "Personalizado (selecionar pacotes)";
          } else {
            targetPlanName = "COMPLETO";
          }

          const ownerId = client.user_id;
          const { fetchServerClients, callIptvServerApi } = await import("@/lib/iptv-server-api.server");
          const { runServerClientAction } = await import("@/lib/server-client-actions.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 1. Localiza o cliente no servidor RBOYS
          const serverClientsRes = await fetchServerClients(ownerId);
          const serverClient = serverClientsRes.clients.find(
            (c) => c.username.trim().toLowerCase() === login.toLowerCase()
          );

          if (!serverClient) {
            return json(
              {
                error: `Cliente com usuário "${login}" não foi encontrado no servidor IPTV.`,
              },
              request,
              { status: 404 }
            );
          }

          // 2. Executa a alteração no servidor RBOYS (sem alterar vencimento nem consumir créditos)
          const serviceType = (serverClient.type || "iptv").toLowerCase() as "iptv" | "p2p";
          let actionSuccess = false;
          let lastActionErr: any = null;

          // Tentativa 1: via runServerClientAction (PUT /{service_type}/clients/{client_id})
          try {
            await runServerClientAction(ownerId, {
              client_id: serverClient.id,
              service_type: serviceType,
              operation: "plan",
              plan_id: targetPlanName,
            });
            actionSuccess = true;
          } catch (err: any) {
            lastActionErr = err;
            console.warn("[portal change-plan] runServerClientAction attempt warning:", err?.message);
          }

          // Tentativa 2 (fallback): PUT /clients/{client_id} direto conforme interface RBOYS
          if (!actionSuccess) {
            try {
              await callIptvServerApi(`/clients/${serverClient.id}`, {
                method: "PUT",
                userId: ownerId,
                body: {
                  plan: targetPlanName,
                  plan_name: targetPlanName,
                  package: targetPlanName,
                },
              });
              actionSuccess = true;
            } catch (fallbackErr: any) {
              console.warn("[portal change-plan] fallback callIptvServerApi warning:", fallbackErr?.message);
              if (!actionSuccess && lastActionErr) {
                throw lastActionErr;
              }
            }
          }

          // 3. Atualiza registro no banco local para persistência rápida
          try {
            await supabaseAdmin
              .from("clients")
              .update({
                server_plan_id: targetPlanName,
                updated_at: new Date().toISOString(),
              })
              .eq("id", client.id);
          } catch (dbErr) {
            console.warn("[portal change-plan] local db update warning:", dbErr);
          }

          return json(
            {
              ok: true,
              message: "Plano atualizado com sucesso no servidor!",
              plan_name: targetPlanName,
            },
            request
          );
        } catch (err: any) {
          console.error("[portal change-plan POST error]", err);
          return json(
            { error: err.message || "Não foi possível alterar o plano no servidor." },
            request,
            { status: 500 }
          );
        }
      },
    },
  },
});
