import type { Database } from "@/integrations/supabase/types";

export type ClientStatus = Database["public"]["Enums"]["client_status"];

export const statusLabel: Record<ClientStatus, string> = {
  ativo: "Ativo",
  vencido: "Vencido",
  suspenso: "Suspenso",
  cancelado: "Cancelado",
};

export const statusVariant: Record<ClientStatus, "default" | "secondary" | "destructive" | "outline"> = {
  ativo: "default",
  vencido: "destructive",
  suspenso: "secondary",
  cancelado: "outline",
};

export const computeStatus = (dueISO: string, current: ClientStatus): ClientStatus => {
  if (current === "suspenso" || current === "cancelado") return current;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueISO + "T00:00:00");
  return due < today ? "vencido" : "ativo";
};
