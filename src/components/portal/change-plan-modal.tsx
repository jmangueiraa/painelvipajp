import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle, X } from "lucide-react";
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

export type PlanOptionKey = "com_adultos" | "sem_adultos" | "personalizado";

export interface PlanOptionItem {
  key: PlanOptionKey;
  label: string;
  plan_id: string | number | null;
  matched_plan_name?: string | null;
  available: boolean;
  has_server_plan?: boolean;
  whatsapp_url?: string;
}

interface PlanApiResponse {
  ok: boolean;
  username: string;
  client_id?: string | number;
  service_type?: "iptv" | "p2p";
  screens?: number;
  current_option?: PlanOptionKey;
  current_plan_name?: string | null;
  options: PlanOptionItem[];
  whatsapp_url?: string;
  error?: string;
}

const DEFAULT_OPTIONS: PlanOptionItem[] = [
  { key: "com_adultos", label: "Com Adultos", plan_id: null, available: true },
  { key: "sem_adultos", label: "Sem Adultos", plan_id: null, available: true },
  { key: "personalizado", label: "Lista Personalizada", plan_id: null, available: true, has_server_plan: false },
];

export function ChangePlanModal({
  open,
  onOpenChange,
  username,
  currentPlanName,
  onSuccess,
}: ChangePlanModalProps) {
  const qc = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<PlanOptionKey>("com_adultos");

  // Busca dinamicamente as 3 opções mapeadas da API do servidor
  const planQuery = useQuery({
    queryKey: ["portal", "client-plan-options", username],
    queryFn: async () => {
      const res = await portalFetch<PlanApiResponse>("/api/public/portal/change-plan");
      return res;
    },
    enabled: open,
    staleTime: 1000 * 60 * 3, // 3 minutos
  });

  const options = planQuery.data?.options && planQuery.data.options.length > 0
    ? planQuery.data.options
    : DEFAULT_OPTIONS;

  // Sincroniza a seleção inicial com o plano atual do cliente retornado pelo servidor
  useEffect(() => {
    if (!open) return;

    if (planQuery.data?.current_option) {
      setSelectedKey(planQuery.data.current_option);
      return;
    }

    const detected = (
      planQuery.data?.current_plan_name ||
      currentPlanName ||
      ""
    ).trim().toLowerCase();

    if (detected.includes("sem adulto") || detected.includes("sem adultos") || detected.includes("sem_adulto")) {
      setSelectedKey("sem_adultos");
    } else if (detected.includes("personalizado") || detected.includes("personalizada")) {
      setSelectedKey("personalizado");
    } else {
      setSelectedKey("com_adultos");
    }
  }, [open, planQuery.data, currentPlanName]);

  const selectedOption = options.find((opt) => opt.key === selectedKey) || options[0];
  const isCustomWithoutPlan = selectedKey === "personalizado" && !selectedOption?.has_server_plan;

  // Mutação para salvar a opção selecionada no servidor
  const changeMutation = useMutation({
    mutationFn: async ({
      optionKey,
      planId,
      user,
    }: {
      optionKey: PlanOptionKey;
      planId?: string | number | null;
      user: string;
    }) => {
      const res = await portalFetch<{ ok: boolean; message?: string; error?: string }>(
        "/api/public/portal/change-plan",
        {
          method: "POST",
          body: JSON.stringify({
            option: optionKey,
            plan_id: planId ?? undefined,
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
      onSuccess?.(selectedOption.label);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Não foi possível alterar o plano.");
    },
  });

  const handleAction = () => {
    // Se escolheu Lista Personalizada e o servidor não possui plano cadastrado, abre o WhatsApp
    if (isCustomWithoutPlan) {
      const targetUser = planQuery.data?.username || username || "cliente";
      const waUrl =
        selectedOption?.whatsapp_url ||
        planQuery.data?.whatsapp_url ||
        `https://wa.me/5519981356505?text=${encodeURIComponent(
          `Olá! Gostaria de solicitar uma Lista Personalizada para o meu usuário ${targetUser}`
        )}`;

      window.open(waUrl, "_blank", "noopener,noreferrer");
      toast.info("Redirecionando para o WhatsApp do suporte...");
      onOpenChange(false);
      return;
    }

    const clientUser = planQuery.data?.username || username;
    changeMutation.mutate({
      optionKey: selectedKey,
      planId: selectedOption?.plan_id,
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

        {/* Corpo: exatamente as 3 opções limpas */}
        <div className="py-2 space-y-4">
          {planQuery.isLoading ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
              <p className="text-xs text-slate-500 font-medium">Carregando opções do servidor...</p>
            </div>
          ) : planQuery.isError || planQuery.data?.ok === false ? (
            <div className="py-6 text-center space-y-2">
              <p className="text-xs text-red-500 font-medium">
                {planQuery.data?.error || planQuery.error?.message || "Erro ao carregar opções do servidor."}
              </p>
              <button
                type="button"
                onClick={() => planQuery.refetch()}
                className="text-xs text-blue-600 font-semibold hover:underline cursor-pointer"
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <div className="space-y-3.5">
              {options.map((opt) => {
                const isSelected = selectedKey === opt.key;

                return (
                  <div key={opt.key} className="space-y-1.5">
                    <label
                      onClick={() => setSelectedKey(opt.key)}
                      className="flex items-center gap-3.5 cursor-pointer select-none group"
                    >
                      {/* Botão de rádio circular idêntico ao RBOYS */}
                      <div className="relative flex items-center justify-center shrink-0">
                        <input
                          type="radio"
                          name="rboys_clean_plan_selection"
                          checked={isSelected}
                          onChange={() => setSelectedKey(opt.key)}
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

                      {/* Nome limpo da opção (sem preços nem durações) */}
                      <span
                        className={`text-[13px] tracking-wide transition-colors ${
                          isSelected
                            ? "text-slate-800 font-semibold"
                            : "text-slate-600 font-normal group-hover:text-slate-800"
                        }`}
                      >
                        {opt.label}
                      </span>
                    </label>

                    {/* Aviso amigável caso selecione Lista Personalizada sem plano na API */}
                    {opt.key === "personalizado" && isSelected && !opt.has_server_plan && (
                      <div className="ml-7 p-3 rounded-2xl bg-orange-50/80 border border-orange-200/70 text-xs text-orange-800 space-y-1 animate-in fade-in-50 duration-200">
                        <p className="font-semibold text-[12px] flex items-center gap-1.5 text-orange-900">
                          <MessageCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          Grade sob medida
                        </p>
                        <p className="text-[11px] text-orange-700 leading-relaxed">
                          Para definir seus canais e remover categorias indesejadas, solicite a personalização diretamente com o suporte.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Subtítulo / Aviso oficial RBOYS idêntico à imagem */}
          <p className="text-[12px] text-slate-400 font-normal leading-relaxed pt-2">
            A troca de plano não altera o vencimento nem consome créditos.
          </p>
        </div>

        {/* Rodapé com botões Cancelar e Salvar / Solicitar WhatsApp */}
        <div className="flex items-center justify-end gap-3 pt-5 mt-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={changeMutation.isPending}
            className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 active:scale-95 border border-slate-200/80 rounded-xl transition cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>

          {isCustomWithoutPlan ? (
            <button
              type="button"
              onClick={handleAction}
              className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              <span>Solicitar no WhatsApp</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleAction}
              disabled={changeMutation.isPending || planQuery.isLoading}
              className="px-5 py-2 text-xs font-bold text-white bg-[#0066FF] hover:bg-[#0055DD] active:scale-95 rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              {changeMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Salvar</span>
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
