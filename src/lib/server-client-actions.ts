import { z } from "zod";

export const serverClientActionSchema = z.object({
  operation: z.enum(["plans", "extend", "message", "plan", "notes", "status", "delete"]),
  service_type: z.enum(["iptv", "p2p"]),
  client_id: z.union([z.string().trim().min(1).max(200), z.number().finite()]),
  plan_id: z.union([z.string().trim().min(1), z.number().finite()]).optional(),
  notes: z.string().max(2000).optional(),
  enabled: z.boolean().optional(),
});
export type ServerClientAction = z.infer<typeof serverClientActionSchema>;

export function serverClientRequest(input: ServerClientAction): {
  endpoint: string; method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: Record<string, unknown>;
} {
  const data = serverClientActionSchema.parse(input);
  const base = `/${data.service_type}/clients/${encodeURIComponent(String(data.client_id))}`;
  switch (data.operation) {
    case "plans": return { endpoint: `/${data.service_type}/plans`, method: "GET" };
    case "message": return { endpoint: `${base}/message`, method: "GET" };
    case "extend":
    case "plan":
      if (data.plan_id === undefined) throw new Error("Escolha um plano.");
      return { endpoint: data.operation === "extend" ? `${base}/extend` : base,
        method: data.operation === "extend" ? "POST" : "PUT", body: { plan_id: data.plan_id } };
    case "notes":
      if (data.notes === undefined) throw new Error("Informe a observação.");
      return { endpoint: `${base}/notes`, method: "PATCH", body: { notes: data.notes.trim() } };
    case "status":
      if (data.enabled === undefined) throw new Error("Informe o status.");
      return { endpoint: `${base}/status`, method: "PATCH", body: { status: data.enabled ? "active" : "disabled" } };
    case "delete": return { endpoint: base, method: "DELETE" };
  }
}

export function serverClientEnabled(client: { raw?: Record<string, unknown> }): boolean {
  const raw = client.raw ?? {};
  const status = String(raw['status'] ?? '').toLowerCase();
  return !["disabled", "inactive", "blocked", "suspended", "suspenso", "cancelado", "inativo", "0"].includes(status)
    && ![raw['enabled'], raw['active'], raw['is_active']].some(value => value === false || value === 0 || value === "0");
}

export function serverAccessMessage(response: unknown): string {
  if (typeof response === "string") return response.trim();
  if (!response || typeof response !== "object") return "";
  const row = response as Record<string, unknown>;
  for (const key of ["message", "text", "m3u", "m3u_url", "url", "data"]) {
    const message = serverAccessMessage(row[key]);
    if (message) return message;
  }
  return "";
}