import { serverClientRequest, serverClientActionSchema, serverAccessMessage, type ServerClientAction } from "./server-client-actions";
import { normalizeServerPlan } from "./iptv-server-api";
import { callIptvServerApi } from "./iptv-server-api.server";

export async function runServerClientAction(ownerId: string, input: ServerClientAction) {
  if (!ownerId) throw new Error("Conta de administrador não identificada.");
  const data = serverClientActionSchema.parse(input);
  const request = serverClientRequest(data);
  const response = await callIptvServerApi<unknown>(request.endpoint, { ...request, userId: ownerId });
  if (response && typeof response === "object" && (response as Record<string, unknown>)['success'] === false) {
    throw new Error("O servidor não concluiu a ação.");
  }
  if (data.operation === "message") {
    const message = serverAccessMessage(response);
    if (!message) throw new Error("O servidor não retornou os dados de acesso.");
    return { ok: true, message };
  }
  if (data.operation === "plans") {
    const row = response && typeof response === "object" ? response as Record<string, unknown> : {};
    const nested = row['data'] && typeof row['data'] === "object" ? row['data'] as Record<string, unknown> : {};
    const items = [response, row['data'], row['plans'], row['items'], nested['plans'], nested['items']].find(Array.isArray) ?? [];
    return { ok: true, plans: items.filter(item => item && typeof item === "object")
      .map(item => normalizeServerPlan(item, data.service_type === "p2p" ? "P2P" : "IPTV"))
      .filter(plan => plan.id !== undefined && plan.id !== null) };
  }
  return { ok: true };
}