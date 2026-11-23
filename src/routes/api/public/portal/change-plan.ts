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

export const Route = createFileRoute("/api/public/portal/change-plan")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => portalOptions(request),

      // GET: Busca os planos reais da API do servidor RBOYS (GET /{service_type}/plans)
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
                error: "Cliente não possui credenciais do servidor IPTV cadastradas.",
                username: client.name,
                plans: [],
              },
              request,
              { status: 400 }
            );
          }

          const ownerId = client.user_id;
          const { fetchServerClients, fetchServerPlans } = await import("@/lib/iptv-server-api.server");

          // 1. Localiza o cliente no servidor para identificar client_id, tipo de serviço e plano atual
          const serverClientsRes = await fetchServerClients(ownerId);
          const serverClient = serverClientsRes.clients.find(
            (c) => c.username.trim().toLowerCase() === login.toLowerCase()
          );

          const serviceType = (serverClient?.type || "IPTV").toUpperCase() as "IPTV" | "P2P";
          const clientUsername = serverClient?.username || login;

          // 2. Busca os planos reais disponíveis na API do servidor (GET /iptv/plans ou GET /p2p/plans)
          const plansRes = await fetchServerPlans(ownerId, serviceType);
          const rawPlans = plansRes.plans || [];

          // 3. Filtra apenas os planos válidos retornados pelo servidor
          // Exclui planos de teste/trial para listar apenas opções de assinatura válidas
          let validPlans = rawPlans.filter((p) => {
            if (p.id === undefined || p.id === null || p.id === "") return false;
            if (p.is_trial) return false;
            const lower = String(p.name || "").toLowerCase();
            if (lower.includes("teste") || lower.includes("trial") || lower.includes("1 hora") || lower.includes("6 horas")) {
              return false;
            }
            return true;
          });

          // Se após o filtro não sobrou nenhum, usa todos que possuem id válido
          if (validPlans.length === 0) {
            validPlans = rawPlans.filter((p) => p.id !== undefined && p.id !== null && p.id !== "");
          }

          // 4. Regra 3: Tratamento da opção "Personalizado":
          // Só exibe opção "Personalizado (selecionar pacotes)" se a rota GET /{service_type}/plans
          // realmente retornar um plano personalizado com ID válido; caso contrário lista apenas os planos válidos.
          const formattedPlans = validPlans.map((p) => {
            let displayName = p.name;
            const lower = displayName.toLowerCase();
            if (lower.includes("personalizado") || lower.includes("personalizar")) {
              displayName = "Personalizado (selecionar pacotes)";
            }
            return {
              id: p.id, // Mantém o formato/tipo original exato (numérico ou string) retornado pela API
              name: displayName,
            };
          });

          // 5. Detecta o plano atual do cliente no servidor
          let currentPlanId: string | number | null = null;
          let currentPlanName: string | null = null;

          if (serverClient) {
            const raw = serverClient.raw || {};
            currentPlanId =
              raw.plan_id ??
              raw.package_id ??
              raw.plan?.id ??
              raw.package?.id ??
              (client as any).server_plan_id ??
              null;

            currentPlanName =
              serverClient.plan_name ??
              raw.plan_name ??
              raw.package_name ??
              raw.plan?.name ??
              raw.package?.name ??
              null;
          }

          return json(
            {
              ok: true,
              username: clientUsername,
              client_id: serverClient?.id,
              service_type: serviceType.toLowerCase() as "iptv" | "p2p",
              current_plan_id: currentPlanId,
              current_plan_name: currentPlanName,
              plans: formattedPlans,
            },
            request
          );
        } catch (err: any) {
          console.error("[portal change-plan GET error]", err);
          return json({ error: err.message || "Falha ao carregar planos do servidor." }, request, {
            status: 500,
          });
        }
      },

      // POST: Executa a troca de plano enviando PUT /{service_type}/clients/{id} com plan_id e username
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
            username?: string;
          };

          if (body.plan_id === undefined || body.plan_id === null || body.plan_id === "") {
            return json({ error: "Selecione um plano válido." }, request, { status: 400 });
          }

          const ownerId = client.user_id;
          const { fetchServerClients, fetchServerPlans, callIptvServerApi } = await import("@/lib/iptv-server-api.server");
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

          const serviceType = (serverClient.type || "iptv").toLowerCase() as "iptv" | "p2p";
          const clientUsername = body.username || serverClient.username || login;

          // 2. Resolve o plan_id real mantendo o formato e tipo original exato da API
          let targetPlanId: string | number = body.plan_id;
          let targetPlanName = "";

          try {
            const plansRes = await fetchServerPlans(ownerId, serverClient.type as "IPTV" | "P2P");
            const match = plansRes.plans?.find(
              (p) => String(p.id) === String(body.plan_id) || p.name.trim().toLowerCase() === String(body.plan_id).trim().toLowerCase()
            );
            if (match) {
              targetPlanId = match.id; // Mantém o ID e tipo exato que a API devolveu
              targetPlanName = match.name;
            }
          } catch (pErr) {
            console.warn("[portal change-plan] fetchServerPlans verification warning:", pErr);
          }

          // 3. Executa PUT /{service_type}/clients/{id} enviando { plan_id, username }
          let actionSuccess = false;
          let lastActionErr: any = null;

          try {
            await runServerClientAction(ownerId, {
              client_id: serverClient.id,
              service_type: serviceType,
              operation: "plan",
              plan_id: targetPlanId,
              username: clientUsername,
            });
            actionSuccess = true;
          } catch (err: any) {
            lastActionErr = err;
            console.warn("[portal change-plan] runServerClientAction attempt warning:", err?.message);
          }

          // Fallback para PUT /clients/{client_id} se a rota prefixada falhar
          if (!actionSuccess) {
            try {
              await callIptvServerApi(`/clients/${serverClient.id}`, {
                method: "PUT",
                userId: ownerId,
                body: {
                  plan_id: targetPlanId,
                  username: clientUsername,
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

          // 4. Salva no banco local para persistência rápida
          try {
            const planPatch = {
              server_plan_id: String(targetPlanId),
              updated_at: new Date().toISOString(),
            } as unknown as Record<string, never>;
            await supabaseAdmin
              .from("clients")
              .update(planPatch)
              .eq("id", client.id);
          } catch (dbErr) {
            console.warn("[portal change-plan] local db update warning:", dbErr);
          }

          return json(
            {
              ok: true,
              message: "Plano atualizado com sucesso no servidor!",
              plan_id: targetPlanId,
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
