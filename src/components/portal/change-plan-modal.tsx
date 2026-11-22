import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { portalFetch } from "@/lib/portal-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ChangePlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
  currentPlanName?: string | null;
  onSuccess?: (newPlanName: string) => void;
}

interface ServerPlanItem {
  id: string | number;
  name: string;
}

interface PlanApiResponse {
  ok: boolean;
  username: string;
  client_name?: string;
  current_plan_id?: string | number | null;
  current_plan_name?: string | null;
  plans: ServerPlanItem[];
  error?: string;
}

const FALLBACK_PLANS: ServerPlanItem[] = [
  { id: "completo_sem_adulto", name: "COMPLETO SEM ADULTO" },
  { id: "completo", name: "COMPLETO" },
  { id: "personalizado", name: "Personalizado (selecionar pacotes)" },
];

export function ChangePlanModal({
  open,
  onOpenChange,
  username,
  currentPlanName,
  onSuccess,
}: ChangePlanModalProps) {
  const qc = useQueryClient();
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [selectedPlanName, setSelectedPlanName] = useState<string>("");

  const planQuery = useQuery({
    queryKey: ["portal", "client-plan-options", username],
    queryFn: async () => {
      const res = await portalFetch<PlanApiResponse>("/api/public/portal/change-plan");
      return res;
    },
    enabled: open,
    staleTime: 1000 * 60 * 5, // 5 minutos
  });

  const availablePlans =
    planQuery.data?.plans && planQuery.data.plans.length > 0
      ? planQuery.data.plans
      : FALLBACK_PLANS;

  // Sincroniza a seleção inicial com o plano atual
  useEffect(() => {
    if (!open) return;

    const initialName =
      planQuery.data?.current_plan_name ||
      currentPlanName ||
      "COMPLETO";

    const initialId = planQuery.data?.current_plan_id
      ? String(planQuery.data.current_plan_id)
      : "";

    if (initialId) {
      setSelectedPlanId(initialId);
      const match = availablePlans.find((p) => String(p.id) === initialId);
      setSelectedPlanName(match ? match.name : initialName);
    } else {
      // Procura por nome correspondente
      const match = availablePlans.find(
        (p) => p.name.trim().toLowerCase() === initialName.trim().toLowerCase()
      );
      if (match) {
        setSelectedPlanId(String(match.id));
        setSelectedPlanName(match.name);
      } else if (availablePlans.length > 0) {
        // Padrão: primeiro plano ou COMPLETO
        const completoMatch = availablePlans.find((p) =>
          p.name.trim().toUpperCase().includes("COMPLETO") &&
          !p.name.trim().toUpperCase().includes("SEM ADULTO")
        );
        const fallback = completoMatch || availablePlans[0];
        setSelectedPlanId(String(fallback.id));
        setSelectedPlanName(fallback.name);
      }
    }
  }, [open, planQuery.data, currentPlanName, availablePlans]);

  const changeMutation = useMutation({
    mutationFn: async ({
      planId,
      planName,
    }: {
      planId: string;
      planName: string;
    }) => {
      const res = await portalFetch<{ ok: boolean; message?: string; error?: string }>(
        "/api/public/portal/change-plan",
        {
          method: "POST",
          body: JSON.stringify({
            plan_id: planId,
            plan_name: planName,
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
      onSuccess?.(selectedPlanName);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Não foi possível alterar o plano.");
    },
  });

  const handleSave = () => {
    if (!selectedPlanId && !selectedPlanName) return;
    changeMutation.mutate({
      planId: selectedPlanId,
      planName: selectedPlanName,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[94vw] max-w-[420px] rounded-2xl bg-white p-6 shadow-xl border border-slate-100"
      >
        {/* Header idêntico à imagem: "Plano de {login}" + botão 'x' */}
        <div className="flex items-center justify-between pb-3">
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

        {/* Corpo com opções de rádio */}
        <div className="py-2 space-y-4">
          {planQuery.isLoading ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
              <p className="text-xs text-slate-500 font-medium">Carregando planos do servidor...</p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {availablePlans.map((plan) => {
                const planIdStr = String(plan.id);
                const isSelected =
                  selectedPlanId === planIdStr ||
                  (!selectedPlanId &&
                    selectedPlanName.trim().toLowerCase() === plan.name.trim().toLowerCase());

                return (
                  <label
                    key={planIdStr}
                    onClick={() => {
                      setSelectedPlanId(planIdStr);
                      setSelectedPlanName(plan.name);
                    }}
                    className="flex items-center gap-3 cursor-pointer select-none group"
                  >
                    {/* Botão de rádio circular exatamente como no RBOYS */}
                    <div className="relative flex items-center justify-center shrink-0">
                      <input
                        type="radio"
                        name="rboys_plan_selection"
                        checked={isSelected}
                        onChange={() => {
                          setSelectedPlanId(planIdStr);
                          setSelectedPlanName(plan.name);
                        }}
                        className="sr-only"
                      />
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                          isSelected
                            ? "border-blue-600 bg-white"
                            : "border-slate-300 bg-white group-hover:border-slate-400"
                        }`}
                      >
                        {isSelected && (
                          <div className="w-2.5 h-2.5 rounded-full bg-blue-600 shadow-xs" />
                        )}
                      </div>
                    </div>

                    {/* Texto da opção */}
                    <span
                      className={`text-[13px] tracking-wide transition-colors ${
                        isSelected
                          ? "text-slate-800 font-bold"
                          : "text-slate-600 font-medium group-hover:text-slate-800"
                      }`}
                    >
                      {plan.name}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {/* Subtítulo / Aviso oficial RBOYS: idêntico à imagem */}
          <p className="text-xs text-slate-400 font-medium leading-relaxed pt-1">
            A troca de plano não altera o vencimento nem consome créditos.
          </p>
        </div>

        {/* Rodapé com botões Cancelar e Salvar exatamente como na imagem */}
        <div className="flex items-center justify-end gap-2.5 pt-4 mt-2">
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
            disabled={changeMutation.isPending || (!selectedPlanId && !selectedPlanName)}
            className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-xl shadow-sm shadow-blue-600/20 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
          >
            {changeMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Salvar</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
