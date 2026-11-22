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

const DEFAULT_SERVER_PLANS = [
  { id: "completo_sem_adulto", name: "COMPLETO SEM ADULTO" },
  { id: "completo", name: "COMPLETO" },
  { id: "personalizado", name: "Personalizado (selecionar pacotes)" },
];

export const Route = createFileRoute("/api/public/portal/change-plan")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => portalOptions(request),

      // GET: Busca os planos disponíveis e o plano atual do cliente no servidor RBOYS
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
                plans: DEFAULT_SERVER_PLANS,
              },
              request,
              { status: 400 }
            );
          }

          const ownerId = client.user_id;
          const { fetchServerPlans, fetchServerClients } = await import("@/lib/iptv-server-api.server");

          // 1. Busca os planos cadastrados no servidor
          let serverPlansList: Array<{ id: string | number; name: string }> = [];
          try {
            const plansRes = await fetchServerPlans(ownerId, "IPTV");
            if (plansRes.ok && Array.isArray(plansRes.plans) && plansRes.plans.length > 0) {
              serverPlansList = plansRes.plans.map((p) => ({
                id: p.id,
                name: p.name,
              }));
            }
          } catch (e) {
            console.warn("[portal change-plan] fetchServerPlans fallback:", e);
          }

          if (serverPlansList.length === 0) {
            serverPlansList = DEFAULT_SERVER_PLANS;
          }

          // 2. Busca dados do cliente no servidor para saber qual plano está ativo
          let currentPlanId: string | number | null = null;
          let currentPlanName: string | null = null;

          try {
            const serverClientsRes = await fetchServerClients(ownerId);
            const serverClient = serverClientsRes.clients.find(
              (c) => c.username.trim().toLowerCase() === login.toLowerCase()
            );

            if (serverClient) {
              const raw = serverClient.raw || {};
              currentPlanId =
                serverClient.plan_id ??
                raw.plan_id ??
                raw.package_id ??
                raw.plan?.id ??
                raw.package?.id ??
                null;
              currentPlanName =
                serverClient.plan_name ??
                raw.plan_name ??
                raw.package_name ??
                raw.plan?.name ??
                raw.package?.name ??
                null;
            }
          } catch (e) {
            console.warn("[portal change-plan] fetchServerClients fallback:", e);
          }

          // Se não identificou nome do plano, tenta inferir ou padrão "COMPLETO"
          if (!currentPlanName && currentPlanId) {
            const match = serverPlansList.find((p) => String(p.id) === String(currentPlanId));
            if (match) currentPlanName = match.name;
          }
          if (!currentPlanName) {
            currentPlanName = "COMPLETO";
          }

          return json(
            {
              ok: true,
              username: login,
              client_name: client.name,
              current_plan_id: currentPlanId,
              current_plan_name: currentPlanName,
              plans: serverPlansList,
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
            plan_id?: string | number;
            plan_name?: string;
          };

          const ownerId = client.user_id;
          const { fetchServerClients, fetchServerPlans } = await import("@/lib/iptv-server-api.server");
          const { runServerClientAction } = await import("@/lib/server-client-actions.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 1. Localiza o cliente no servidor
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

          // 2. Resolve o plan_id no servidor
          let targetPlanId = body.plan_id;
          let targetPlanName = body.plan_name || "";

          // Se passou apenas nome do plano ou se plan_id for simbólico, resolve o ID real na API do servidor
          if (!targetPlanId || isNaN(Number(targetPlanId))) {
            try {
              const plansRes = await fetchServerPlans(ownerId, serverClient.type);
              const plansList = plansRes.plans || [];

              // Procura correspondência exata ou parcial pelo nome
              const searchName = (targetPlanName || String(targetPlanId || "")).toLowerCase().trim();
              const match = plansList.find((p) => {
                const pName = p.name.toLowerCase().trim();
                return pName === searchName || (searchName && pName.includes(searchName));
              });

              if (match) {
                targetPlanId = match.id;
                targetPlanName = match.name;
              } else if (plansList.length > 0) {
                // Fallback para o primeiro plano que corresponda
                targetPlanId = plansList[0].id;
                targetPlanName = plansList[0].name;
              }
            } catch (pErr) {
              console.warn("[portal change-plan] plan resolution fallback:", pErr);
            }
          }

          if (targetPlanId === undefined || targetPlanId === null) {
            return json({ error: "Escolha um plano válido." }, request, { status: 400 });
          }

          // 3. Executa a alteração de plano no servidor (PUT /{service_type}/clients/{client_id} com { plan_id })
          await runServerClientAction(ownerId, {
            client_id: serverClient.id,
            service_type: serverClient.type.toLowerCase() as "iptv" | "p2p",
            operation: "plan",
            plan_id: targetPlanId,
          });

          // 4. Grava atualização no banco local para persistência rápida
          try {
            await supabaseAdmin
              .from("clients")
              .update({
                server_plan_id: String(targetPlanId),
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
              plan_id: targetPlanId,
              plan_name: targetPlanName || "Plano atualizado",
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
