import { createFileRoute } from "@tanstack/react-router";
import { translateError } from "@/lib/translate-error";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Server as ServerIcon } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { brl, parseBrlToCents } from "@/lib/format";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/servidores")({
  head: () => ({ meta: [{ title: "Servidores — Painel VIP" }] }),
  component: ServidoresPage,
});

type Server = { id: string; name: string; credit_cost_cents: number };

function ServidoresPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["servers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("servers").select("id,name,credit_cost_cents").order("name");
      if (error) throw error;
      return data as Server[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sem sessão");
      if (name.trim().length < 2) throw new Error("Informe o nome do servidor");
      const { error } = await supabase.from("servers").insert({
        user_id: user.id,
        name: name.trim(),
        credit_cost_cents: parseBrlToCents(cost || "0"),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Servidor adicionado");
      setName(""); setCost("");
      qc.invalidateQueries({ queryKey: ["servers"] });
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("servers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Servidor removido");
      qc.invalidateQueries({ queryKey: ["servers"] });
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Servidores"
        description="Cadastre seus servidores e o custo de crédito de cada um. O custo será descontado do lucro a cada renovação."
      />

      <Card>
        <CardContent className="p-4 md:p-5">
          <p className="text-[11px] font-semibold tracking-wider uppercase text-zinc-400 mb-3">Novo servidor</p>
          <form
            onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
            className="grid grid-cols-1 md:grid-cols-[1fr_220px_auto] gap-3"
          >
            <div>
              <Label htmlFor="srv-name" className="sr-only">Nome</Label>
              <Input id="srv-name" placeholder="Nome (ex: Playcine)" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="srv-cost" className="sr-only">Custo</Label>
              <Input id="srv-cost" inputMode="decimal" placeholder="Custo do crédito (R$)" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
            <Button type="submit" className="bg-white text-zinc-950 font-medium hover:bg-zinc-200" disabled={create.isPending}>
              <Plus className="size-4" /> Adicionar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 md:p-5">
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : data && data.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {data.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/50 hover:border-zinc-700/80 transition-colors px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-9 rounded-lg grid place-items-center bg-zinc-800/60 border border-zinc-700/50 text-zinc-300 shrink-0">
                      <ServerIcon className="size-4.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-100 truncate">{s.name}</p>
                      <p className="text-xs text-zinc-400">Custo: {brl(s.credit_cost_cents)} / renovação</p>
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" className="text-zinc-400 hover:text-rose-400"><Trash2 className="size-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover {s.name}?</AlertDialogTitle>
                        <AlertDialogDescription>Clientes vinculados perderão a referência ao servidor.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove.mutate(s.id)}>Remover</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-center text-sm text-zinc-500 py-6">Nenhum servidor cadastrado ainda.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
