import type { NormalizedServerClient } from "@/lib/iptv-server-api";
import { portalFetch } from "@/lib/portal-client";

export type ServerClientStatusFilter = "todos" | "ativos" | "desativados" | "vencidos" | "vencem_hoje" | "a_vencer_mes";

export function dueThisMonth(client: NormalizedServerClient, today: string): boolean {
  const due = client.due_date_str;
  return typeof due === "string" && due > today && due.slice(0, 7) === today.slice(0, 7);
}

const count = (value: unknown, fallback = 0) => {
  const n = value == null ? NaN : Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
};

export function normalizeServerClients(response: unknown) {
  const r = response && typeof response === "object" ? response as Record<string, unknown> : {};
  const clients = (Array.isArray(r["clients"]) ? r["clients"] : [])
    .filter((c): c is NormalizedServerClient => c != null && typeof c === "object")
    .map(c => ({ ...c, username: String(c.username ?? "") }));
  const k = r["kpis"] && typeof r["kpis"] === "object" ? r["kpis"] as Record<string, unknown> : {};

  const desativadosCount = clients.filter(c => c.is_disabled || c.status === "desativado" || String(c.status) === "disabled").length;
  const vencidosCount = clients.filter(c => !c.is_disabled && c.status !== "desativado" && (c.is_expired || c.status === "vencido" || c.status === "expired") && !c.is_due_today).length;
  const vencemHojeCount = clients.filter(c => !c.is_disabled && c.status !== "desativado" && (c.is_due_today || c.status === "vencem_hoje")).length;
  const ativosCount = clients.filter(c => !c.is_disabled && c.status !== "desativado" && String(c.status) !== "disabled" && (!c.is_expired || c.is_due_today)).length;

  return {
    ok: Boolean(r["ok"]),
    server_name: String(r["server_name"] ?? ""),
    base_url: String(r["base_url"] ?? ""),
    error: typeof r["error"] === "string" ? r["error"] : undefined,
    total: count(r["total"], clients.length),
    clients,
    kpis: {
      total: count(k["total"], clients.length),
      ativos: count(k["ativos"], ativosCount),
      desativados: count(k["desativados"], desativadosCount),
      vencidos: count(k["vencidos"], vencidosCount),
      vencem_hoje: count(k["vencem_hoje"], vencemHojeCount),
    },
  };
}

export const serverClientsQueryOptions = {
  queryKey: ["portal", "admin", "server-clients"],
  queryFn: async () => normalizeServerClients(await portalFetch("/api/public/portal/admin", {
    method: "POST", body: JSON.stringify({ action: "get_server_clients" }),
  })),
  staleTime: 30_000,
  refetchOnWindowFocus: false,
};