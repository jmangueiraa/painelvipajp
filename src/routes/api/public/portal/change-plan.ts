import { createFileRoute } from "@tanstack/react-router";
import { portalCorsHeaders, portalOptions } from "@/lib/portal-cors";
import type { NormalizedServerPlan } from "@/lib/iptv-server-api";

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

/**
 * Função de Mapeamento Inteligente:
 * Encontra o plano real do servidor correspondente à modalidade e quantidade de telas do cliente.
 * Ignora planos de teste e prioriza planos mensais (1 mês / 1 crédito).
 */
function findBestPlan(
  plans: NormalizedServerPlan[],
  mode: "adulto" | "sem_adulto" | "personalizado",
  clientScreens = 1
): NormalizedServerPlan | null {
  // 1. Filtra planos válidos que não sejam de teste/trial
  const candidates = plans.filter((p) => {
    if (p.id === undefined || p.id === null || p.id === "") return false;
    if (p.is_trial) return false;
    const n = String(p.name || "").toLowerCase();
    if (n.includes("teste") || n.includes("trial") || n.includes("1 hora") || n.includes("3 horas") || n.includes("6 horas")) {
      return false;
    }
    return true;
  });

  if (mode === "personalizado") {
    const found = candidates.find((p) => {
      const n = String(p.name || "").toLowerCase();
      return n.includes("personalizado") || n.includes("personalizada") || n.includes("custom");
    });
    return found || null;
  }

  // 2. Filtra por conteúdo adulto vs sem adulto
  const modeFiltered = candidates.filter((p) => {
    const n = String(p.name || "").toLowerCase();
    const isSemAdulto =
      n.includes("sem adulto") ||
      n.includes("sem adultos") ||
      n.includes("sem_adulto") ||
      n.includes("semadulto");

    if (mode === "sem_adulto") {
      return isSemAdulto;
    } else {
      // mode === 'adulto': deve conter completo/adulto e NÃO conter sem adulto
      return !isSemAdulto && (n.includes("completo") || n.includes("com adulto") || n.includes("adulto"));
    }
  });

  if (modeFiltered.length === 0) {
    return null;
  }

  // 3. Prioriza plano mensal de 1 mês (exclui durações de 2, 3, 6, 12 meses)
  const oneMonthFiltered = modeFiltered.filter((p) => {
    const n = String(p.name || "").toLowerCase();
    // Exclui durações múltiplas
    if (
      n.includes("12 mes") ||
      n.includes("6 mes") ||
      n.includes("3 mes") ||
      n.includes("2 mes") ||
      n.includes("12 meses") ||
      n.includes("6 meses") ||
      n.includes("3 meses") ||
      n.includes("2 meses")
    ) {
      return false;
    }
    // Deve indicar 1 mês ou duração de ~30 dias
    if (
      n.includes("1 mês") ||
      n.includes("1 mes") ||
      n.includes("30 dias") ||
      n.includes("1 credito") ||
      n.includes("1 crédito")
    ) {
      return true;
    }
    if (p.duration_days && p.duration_days >= 25 && p.duration_days <= 35) {
      return true;
    }
    return false;
  });

  const pool = oneMonthFiltered.length > 0 ? oneMonthFiltered : modeFiltered;

  // 4. Seleciona pela quantidade de telas/conexões do cliente
  if (clientScreens > 1) {
    const screenMatch = pool.find((p) => {
      const n = String(p.name || "").toLowerCase();
      return (
        n.includes(`${clientScreens} acesso`) ||
        n.includes(`${clientScreens} acessos`) ||
        n.includes(`${clientScreens} tela`) ||
        n.includes(`${clientScreens} telas`) ||
        p.screens === clientScreens
      );
    });
    if (screenMatch) return screenMatch;
  }

  // Para 1 tela (ou fallback geral): prefere plano que não mencione 2 ou 3 acessos
  const singleScreenMatch = pool.find((p) => {
    const n = String(p.name || "").toLowerCase();
    return (
      !n.includes("2 acesso") &&
      !n.includes("3 acesso") &&
      !n.includes("4 acesso") &&
      !n.includes("2 tela") &&
      !n.includes("3 tela") &&
      !n.includes("4 tela") &&
      (p.screens === 1 || !p.screens)
    );
  });

  return singleScreenMatch || pool[0] || null;
}

export const Route = createFileRoute("/api/public/portal/change-plan")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => portalOptions(request),

      // GET: Retorna APENAS as 3 opções limpas para o cliente com os plan_ids mapeados internamente
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
                options: [],
              },
              request,
              { status: 400 }
            );
          }

          const ownerId = client.user_id;
          const { fetchServerClients, fetchServerPlans } = await import("@/lib/iptv-server-api.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 1. Localiza o cliente no servidor RBOYS
          const serverClientsRes = await fetchServerClients(ownerId);
          const serverClient = serverClientsRes.clients.find(
            (c) => c.username.trim().toLowerCase() === login.toLowerCase()
          );

          const serviceType = (serverClient?.type || "IPTV").toUpperCase() as "IPTV" | "P2P";
          const clientUsername = serverClient?.username || login;

          // 2. Identifica a quantidade de telas/conexões do cliente (padrão 1 tela)
          const clientScreens =
            Number(
              serverClient?.connections ??
              serverClient?.raw?.max_connections ??
              serverClient?.raw?.connections ??
              (client as any).points ??
              1
            ) || 1;

          // 3. Busca os planos reais disponíveis na API do servidor (GET /iptv/plans ou GET /p2p/plans)
          const plansRes = await fetchServerPlans(ownerId, serviceType);
          const rawPlans = plansRes.plans || [];

          // 4. Mapeamento Inteligente para as 3 opções solicitadas
          const comAdultosPlan = findBestPlan(rawPlans, "adulto", clientScreens);
          const semAdultosPlan = findBestPlan(rawPlans, "sem_adulto", clientScreens);
          const personalizadoPlan = findBestPlan(rawPlans, "personalizado", clientScreens);

          // 5. Identifica o plano atual do cliente para pré-selecionar no modal
          const rawPlanName = String(
            serverClient?.plan_name ??
            serverClient?.raw?.plan_name ??
            serverClient?.raw?.package_name ??
            serverClient?.raw?.plan?.name ??
            serverClient?.raw?.plan ??
            (client as any).server_plan_id ??
            ""
          ).toLowerCase();

          let currentOption: "com_adultos" | "sem_adultos" | "personalizado" = "com_adultos";
          if (
            rawPlanName.includes("sem adulto") ||
            rawPlanName.includes("sem adultos") ||
            rawPlanName.includes("sem_adulto")
          ) {
            currentOption = "sem_adultos";
          } else if (rawPlanName.includes("personalizado") || rawPlanName.includes("personalizada")) {
            currentOption = "personalizado";
          } else {
            currentOption = "com_adultos";
          }

          // 6. Monta URL do WhatsApp para solicitação de lista personalizada
          let whatsappPhone = "5519981356505";
          try {
            const { data: s } = await supabaseAdmin
              .from("settings")
              .select("phone, whatsapp")
              .eq("user_id", ownerId)
              .maybeSingle();
            const rawP = (s as any)?.whatsapp || (s as any)?.phone;
            if (rawP) {
              const digits = String(rawP).replace(/\D/g, "");
              if (digits.length >= 10) {
                whatsappPhone = digits.startsWith("55") ? digits : `55${digits}`;
              }
            }
          } catch (phoneErr) {
            console.warn("[portal change-plan] phone lookup fallback:", phoneErr);
          }

          const whatsappMessage = `Olá! Gostaria de solicitar uma Lista Personalizada para o meu usuário ${clientUsername}`;
          const whatsappUrl = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(whatsappMessage)}`;

          // 7. Estrutura exata das 3 opções limpas
          const options = [
            {
              key: "com_adultos" as const,
              label: "Com Adultos",
              plan_id: comAdultosPlan?.id ?? null,
              matched_plan_name: comAdultosPlan?.name ?? null,
              available: Boolean(comAdultosPlan),
            },
            {
              key: "sem_adultos" as const,
              label: "Sem Adultos",
              plan_id: semAdultosPlan?.id ?? null,
              matched_plan_name: semAdultosPlan?.name ?? null,
              available: Boolean(semAdultosPlan),
            },
            {
              key: "personalizado" as const,
              label: "Lista Personalizada",
              plan_id: personalizadoPlan?.id ?? null,
              matched_plan_name: personalizadoPlan?.name ?? null,
              available: true,
              has_server_plan: Boolean(personalizadoPlan),
              whatsapp_url: whatsappUrl,
            },
          ];

          return json(
            {
              ok: true,
              username: clientUsername,
              client_id: serverClient?.id,
              service_type: serviceType.toLowerCase() as "iptv" | "p2p",
              screens: clientScreens,
              current_option: currentOption,
              current_plan_name: serverClient?.plan_name || (client as any).server_plan_id || null,
              options,
              whatsapp_url: whatsappUrl,
            },
            request
          );
        } catch (err: any) {
          console.error("[portal change-plan GET error]", err);
          return json({ error: err.message || "Falha ao carregar opções de plano do servidor." }, request, {
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
            option?: "com_adultos" | "sem_adultos" | "personalizado";
            plan_id?: string | number;
            username?: string;
          };

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
          const clientScreens =
            Number(
              serverClient.connections ??
              serverClient.raw?.max_connections ??
              serverClient.raw?.connections ??
              (client as any).points ??
              1
            ) || 1;

          // 2. Busca os planos reais do servidor para garantir plan_id exato e válido
          const plansRes = await fetchServerPlans(ownerId, serverClient.type as "IPTV" | "P2P");
          const rawPlans = plansRes.plans || [];

          let targetPlanId: string | number | null = null;
          let targetPlanName = "";

          // Se a opção foi enviada ("com_adultos", "sem_adultos", "personalizado")
          if (body.option) {
            if (body.option === "com_adultos") {
              const matched = findBestPlan(rawPlans, "adulto", clientScreens);
              if (matched) {
                targetPlanId = matched.id;
                targetPlanName = "Com Adultos";
              }
            } else if (body.option === "sem_adultos") {
              const matched = findBestPlan(rawPlans, "sem_adulto", clientScreens);
              if (matched) {
                targetPlanId = matched.id;
                targetPlanName = "Sem Adultos";
              }
            } else if (body.option === "personalizado") {
              const matched = findBestPlan(rawPlans, "personalizado", clientScreens);
              if (matched) {
                targetPlanId = matched.id;
                targetPlanName = "Lista Personalizada";
              } else {
                return json(
                  {
                    error: "A personalização da grade de canais deve ser solicitada com nossa equipe pelo WhatsApp.",
                    need_whatsapp: true,
                  },
                  request,
                  { status: 400 }
                );
              }
            }
          }

          // Se passou plan_id diretamente e ainda não foi resolvido
          if (targetPlanId === null && body.plan_id !== undefined && body.plan_id !== null && body.plan_id !== "") {
            const directMatch = rawPlans.find((p) => String(p.id) === String(body.plan_id));
            if (directMatch) {
              targetPlanId = directMatch.id;
              targetPlanName = directMatch.name;
            } else {
              targetPlanId = body.plan_id;
              targetPlanName = String(body.plan_id);
            }
          }

          if (targetPlanId === null || targetPlanId === undefined || targetPlanId === "") {
            return json(
              { error: "Não foi possível identificar o plano selecionado no servidor." },
              request,
              { status: 400 }
            );
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
              server_plan_id: String(targetPlanName || targetPlanId),
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
