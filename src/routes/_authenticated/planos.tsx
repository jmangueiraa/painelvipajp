import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Package } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { brl, parseBrlToCents } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/planos")({
  head: () => ({ meta: [{ title: "Planos — Painel VIP" }] }),
  component: PlanosPage,
});

const schema = z.object({
  name: z.string().trim().min(2, "Mínimo 2 caracteres").max(80),
  price: z.string().min(1, "Informe o valor"),
  duration_days: z.coerce.number().int().min(1).max(3650),
  description: z.string().max(500).optional().or(z.literal("")),
  active: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

type Plan = { id: string; name: string; price_cents: number; duration_days: number; description: string | null; active: boolean };

function PlanosPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);

  // inline create state
  const [quickName, setQuickName] = useState("");
  const [quickPrice, setQuickPrice] = useState("");
  const [quickDuration, setQuickDuration] = useState("30");

  const { data, isLoading } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Plan[];
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", price: "", duration_days: 30, description: "", active: true },
  });

  const openEdit = (p: Plan) => {
    setEditing(p);
    form.reset({
      name: p.name,
      price: (p.price_cents / 100).toFixed(2).replace(".", ","),
      duration_days: p.duration_days,
      description: p.description ?? "",
      active: p.active,
    });
    setOpen(true);
  };

  const quickCreate = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sem sessão");
      if (quickName.trim().length < 2) throw new Error("Informe o nome do plano");
      const { error } = await supabase.from("plans").insert({
        user_id: user.id,
        name: quickName.trim(),
        price_cents: parseBrlToCents(quickPrice || "0"),
        duration_days: Math.max(1, parseInt(quickDuration || "30", 10)),
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plano adicionado");
      setQuickName(""); setQuickPrice(""); setQuickDuration("30");
      qc.invalidateQueries({ queryKey: ["plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveEdit = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!user || !editing) throw new Error("Sem sessão");
      const { error } = await supabase.from("plans").update({
        name: values.name.trim(),
        price_cents: parseBrlToCents(values.price),
        duration_days: values.duration_days,
        description: values.description?.trim() || null,
        active: values.active,
      }).eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plano atualizado");
      qc.invalidateQueries({ queryKey: ["plans"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plano excluído");
      qc.invalidateQueries({ queryKey: ["plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Planos" description="Crie planos para acelerar o cadastro de clientes." />

      <Card>
        <CardContent className="p-4 md:p-5">
          <p className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-3">Novo plano</p>
          <form
            onSubmit={(e) => { e.preventDefault(); quickCreate.mutate(); }}
            className="grid grid-cols-1 md:grid-cols-[1fr_160px_120px_auto] gap-3"
          >
            <div><Label htmlFor="pl-name" className="sr-only">Nome</Label>
              <Input id="pl-name" placeholder="Nome (ex: Mensal HD)" value={quickName} onChange={(e) => setQuickName(e.target.value)} />
            </div>
            <div><Label htmlFor="pl-price" className="sr-only">Preço</Label>
              <Input id="pl-price" inputMode="decimal" placeholder="Preço (R$)" value={quickPrice} onChange={(e) => setQuickPrice(e.target.value)} />
            </div>
            <div><Label htmlFor="pl-dur" className="sr-only">Duração</Label>
              <Input id="pl-dur" type="number" min={1} placeholder="30" value={quickDuration} onChange={(e) => setQuickDuration(e.target.value)} />
            </div>
            <Button type="submit" className="btn-premium rounded-full" disabled={quickCreate.isPending}>
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
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.map((p) => (
                <li key={p.id} className="kpi-card p-4" style={{ "--kpi-color": p.active ? "var(--kpi-cyan)" : "var(--muted-foreground)" } as React.CSSProperties}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-10 rounded-lg grid place-items-center bg-[color:color-mix(in_oklab,var(--primary)_15%,transparent)] text-primary shrink-0">
                        <Package className="size-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.duration_days} dias</p>
                      </div>
                    </div>
                    <Badge variant={p.active ? "default" : "secondary"}>{p.active ? "Ativo" : "Inativo"}</Badge>
                  </div>
                  <p className="mt-3 text-2xl font-bold text-[color:var(--kpi-cyan)] tabular-nums">{brl(p.price_cents)}</p>
                  <div className="mt-3 flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="size-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost"><Trash2 className="size-4 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir {p.name}?</AlertDialogTitle>
                          <AlertDialogDescription>Clientes vinculados perderão a referência ao plano.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove.mutate(p.id)}>Excluir</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-6">Nenhum plano cadastrado ainda.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar plano</DialogTitle></DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => saveEdit.mutate(v))} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Nome</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="price" render={({ field }) => (
                  <FormItem><FormLabel>Valor (R$)</FormLabel><FormControl><Input inputMode="decimal" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="duration_days" render={({ field }) => (
                  <FormItem><FormLabel>Duração (dias)</FormLabel><FormControl><Input type="number" min={1} {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Descrição</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="active" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div><FormLabel className="mb-0">Ativo</FormLabel>
                    <p className="text-xs text-muted-foreground">Planos inativos não aparecem ao cadastrar clientes.</p>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" className="btn-premium rounded-full" disabled={saveEdit.isPending}>Salvar</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
