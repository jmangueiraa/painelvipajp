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

export interface ServerPlanItem {
  id: string | number;
  name: string;
}

interface PlanApiResponse {
  ok: boolean;
  username: string;
  client_id?: string | number;
  service_type?: "iptv" | "p2p";
  current_plan_id?: string | number | null;
  current_plan_name?: string | null;
  plans: ServerPlanItem[];
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
  const [selectedPlanId, setSelectedPlanId] = useState<string | number | "">("");
  const [selectedPlanName, setSelectedPlanName] = useState<string>("");

  // Busca dinamicamente os planos reais da API do servidor RBOYS (GET /{service_type}/plans)
  const planQuery = useQuery({
    queryKey: ["portal", "client-plan-options", username],
    queryFn: async () => {
      const res = await portalFetch<PlanApiResponse>("/api/public/portal/change-plan");
      return res;
    },
    enabled: open,
    staleTime: 1000 * 60 * 5, // 5 minutos
  });

  const availablePlans = planQuery.data?.plans || [];

  // Sincroniza a seleção inicial com o plano atual do cliente retornado pelo servidor
  useEffect(() => {
    if (!open || availablePlans.length === 0) return;

    // 1. Tenta correspondência pelo plan_id atual do servidor
    const currentId = planQuery.data?.current_plan_id;
    if (currentId !== undefined && currentId !== null && currentId !== "") {
      const matchById = availablePlans.find((p) => String(p.id) === String(currentId));
      if (matchById) {
        setSelectedPlanId(matchById.id);
        setSelectedPlanName(matchById.name);
        return;
      }
    }

    // 2. Tenta correspondência pelo nome do plano
    const detectedName = (
      planQuery.data?.current_plan_name ||
      currentPlanName ||
      ""
    ).trim().toLowerCase();

    if (detectedName) {
      const matchByName = availablePlans.find((p) => {
        const pName = p.name.trim().toLowerCase();
        return pName === detectedName || pName.includes(detectedName) || detectedName.includes(pName);
      });

      if (matchByName) {
        setSelectedPlanId(matchByName.id);
        setSelectedPlanName(matchByName.name);
        return;
      }
    }

    // 3. Fallback: seleciona o primeiro plano retornado pela API
    if (availablePlans.length > 0) {
      setSelectedPlanId(availablePlans[0].id);
      setSelectedPlanName(availablePlans[0].name);
    }
  }, [open, planQuery.data, currentPlanName, availablePlans]);

  // Mutação para salvar: envia o plan_id com o tipo exato (string ou number) e o username
  const changeMutation = useMutation({
    mutationFn: async ({
      planId,
      user,
    }: {
      planId: string | number;
      user: string;
    }) => {
      const res = await portalFetch<{ ok: boolean; message?: string; error?: string }>(
        "/api/public/portal/change-plan",
        {
          method: "POST",
          body: JSON.stringify({
            plan_id: planId,
            username: user,
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
    if (selectedPlanId === "" || selectedPlanId === undefined || selectedPlanId === null) {
      toast.error("Por favor, selecione um plano.");
      return;
    }
    const clientUser = planQuery.data?.username || username;
    changeMutation.mutate({
      planId: selectedPlanId,
      user: clientUser,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] max-w-[430px] rounded-3xl bg-white p-6 shadow-2xl border border-slate-100 sm:p-7">
        {/* Cabeçalho oficial: "Plano de {username}" + botão fechar (x) */}
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

        {/* Corpo: renderização estritamente dinâmica dos planos reais da API */}
        <div className="py-2 space-y-4">
          {planQuery.isLoading ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
              <p className="text-xs text-slate-500 font-medium">Carregando planos do servidor...</p>
            </div>
          ) : planQuery.isError || planQuery.data?.ok === false ? (
            <div className="py-6 text-center space-y-2">
              <p className="text-xs text-red-500 font-medium">
                {planQuery.data?.error || planQuery.error?.message || "Erro ao carregar planos do servidor."}
              </p>
              <button
                type="button"
                onClick={() => planQuery.refetch()}
                className="text-xs text-blue-600 font-semibold hover:underline cursor-pointer"
              >
                Tentar novamente
              </button>
            </div>
          ) : availablePlans.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              Nenhum plano disponível no servidor.
            </div>
          ) : (
            <div className="space-y-4">
              {availablePlans.map((plan) => {
                const isSelected = String(selectedPlanId) === String(plan.id);

                return (
                  <label
                    key={String(plan.id)}
                    onClick={() => {
                      setSelectedPlanId(plan.id);
                      setSelectedPlanName(plan.name);
                    }}
                    className="flex items-center gap-3.5 cursor-pointer select-none group"
                  >
                    {/* Botão de rádio circular idêntico ao RBOYS */}
                    <div className="relative flex items-center justify-center shrink-0">
                      <input
                        type="radio"
                        name="rboys_real_plan_selection"
                        checked={isSelected}
                        onChange={() => {
                          setSelectedPlanId(plan.id);
                          setSelectedPlanName(plan.name);
                        }}
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

                    {/* Nome do plano */}
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
          )}

          {/* Subtítulo / Aviso oficial RBOYS idêntico à imagem */}
          <p className="text-[12px] text-slate-400 font-normal leading-relaxed pt-2">
            A troca de plano não altera o vencimento nem consome créditos.
          </p>
        </div>

        {/* Rodapé com botões Cancelar e Salvar */}
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
            disabled={
              changeMutation.isPending ||
              planQuery.isLoading ||
              selectedPlanId === "" ||
              selectedPlanId === undefined ||
              selectedPlanId === null
            }
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
