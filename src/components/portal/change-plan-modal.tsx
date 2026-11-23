import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { portalFetch } from "@/lib/portal-client";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ChangePlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
  currentPlanName?: string | null;
  onSuccess?: (newPlanName: string) => void;
}

// Conforme tela oficial do RBOYS (Imagem 2), são exatamente e apenas estas 3 opções de plano/pacote de canais:
export const RBOYS_CONTENT_PLANS = [
  { id: "COMPLETO SEM ADULTO", name: "COMPLETO SEM ADULTO" },
  { id: "COMPLETO", name: "COMPLETO" },
  { id: "Personalizado (selecionar pacotes)", name: "Personalizado (selecionar pacotes)" },
] as const;

export type RboysContentPlanName = (typeof RBOYS_CONTENT_PLANS)[number]["name"];

interface PlanApiResponse {
  ok: boolean;
  username: string;
  client_name?: string;
  current_plan_id?: string | number | null;
  current_plan_name?: string | null;
  plans: Array<{ id: string | number; name: string }>;
  error?: string;
}

export function ChangePlanModal({
  open,
  onOpenChange,
  username,
  currentPlanName,
  onSuccess,
}: ChangePlanModalProps) {
  const qc = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<RboysContentPlanName>("COMPLETO");

  const planQuery = useQuery({
    queryKey: ["portal", "client-plan-options", username],
    queryFn: async () => {
      const res = await portalFetch<PlanApiResponse>("/api/public/portal/change-plan");
      return res;
    },
    enabled: open,
    staleTime: 1000 * 60 * 5, // 5 minutos
  });

  // Sincroniza a seleção inicial com o plano atual do cliente
  useEffect(() => {
    if (!open) return;

    const detected = (
      planQuery.data?.current_plan_name ||
      currentPlanName ||
      "COMPLETO"
    )
      .trim()
      .toUpperCase();

    if (detected.includes("SEM ADULTO")) {
      setSelectedPlan("COMPLETO SEM ADULTO");
    } else if (detected.includes("PERSONALIZADO")) {
      setSelectedPlan("Personalizado (selecionar pacotes)");
    } else {
      setSelectedPlan("COMPLETO");
    }
  }, [open, planQuery.data, currentPlanName]);

  const changeMutation = useMutation({
    mutationFn: async (planToSet: RboysContentPlanName) => {
      const res = await portalFetch<{ ok: boolean; message?: string; error?: string }>(
        "/api/public/portal/change-plan",
        {
          method: "POST",
          body: JSON.stringify({
            plan_id: planToSet,
            plan_name: planToSet,
          }),
        }
      );
      if (res?.ok === false || res?.error) {
        throw new Error(res.error || "Falha ao alterar plano no servidor.");
      }
      return res;
    },
    onSuccess: (data) => {
      toast.success(data.message || "Plano atualizado com sucesso no servidor!");
      qc.invalidateQueries({ queryKey: ["portal", "me"] });
      qc.invalidateQueries({ queryKey: ["portal", "client-plan-options"] });
      onSuccess?.(selectedPlan);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Não foi possível alterar o plano.");
    },
  });

  const handleSave = () => {
    if (!selectedPlan) return;
    changeMutation.mutate(selectedPlan);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-[430px] rounded-3xl bg-white p-6 shadow-2xl border border-slate-100 sm:p-7">
        {/* Header idêntico à tela do RBOYS (Imagem 2): "Plano de {login}" + botão 'x' */}
        <div className="flex items-center justify-between pb-4">
          <DialogTitle className="text-base sm:text-lg font-bold text-slate-800 tracking-tight">
            Plano de {username || "Cliente"}
          </DialogTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={changeMutation.isPending}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition cursor-pointer"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Corpo com exatamente e apenas as 3 opções de rádio (Imagem 2) */}
        <div className="py-2 space-y-4">
          <div className="space-y-4">
            {RBOYS_CONTENT_PLANS.map((plan) => {
              const isSelected = selectedPlan === plan.name;

              return (
                <label
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.name)}
                  className="flex items-center gap-3.5 cursor-pointer select-none group"
                >
                  {/* Botão de rádio circular exatamente idêntico ao RBOYS */}
                  <div className="relative flex items-center justify-center shrink-0">
                    <input
                      type="radio"
                      name="rboys_plan_selection"
                      checked={isSelected}
                      onChange={() => setSelectedPlan(plan.name)}
                      className="sr-only"
                    />
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                        isSelected
                          ? "border-[#0066FF] bg-white"
                          : "border-slate-300 bg-white group-hover:border-slate-400"
                      }`}
                    >
                      {isSelected && (
                        <div className="w-2.5 h-2.5 rounded-full bg-[#0066FF] shadow-xs" />
                      )}
                    </div>
                  </div>

                  {/* Texto da opção */}
                  <span
                    className={`text-[13px] tracking-wide transition-colors ${
                      isSelected
                        ? "text-slate-800 font-semibold"
                        : "text-slate-600 font-normal group-hover:text-slate-800"
                    }`}
                  >
                    {plan.name}
                  </span>
                </label>
              );
            })}
          </div>

          {/* Subtítulo / Aviso oficial RBOYS idêntico à imagem */}
          <p className="text-[12px] text-slate-400 font-normal leading-relaxed pt-2">
            A troca de plano não altera o vencimento nem consome créditos.
          </p>
        </div>

        {/* Rodapé com botões Cancelar e Salvar exatamente como no RBOYS */}
        <div className="flex items-center justify-end gap-3 pt-5 mt-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={changeMutation.isPending}
            className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 active:scale-95 border border-slate-200/80 rounded-xl transition cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={changeMutation.isPending}
            className="px-5 py-2 text-xs font-bold text-white bg-[#0066FF] hover:bg-[#0055DD] active:scale-95 rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
          >
            {changeMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Salvar</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
