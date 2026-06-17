import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { brl, parseBrlToCents } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/planos")({
  head: () => ({ meta: [{ title: "Planos — Painel VIP" }] }),
  component: PlanosPage,
});

const schema = z.object({
  name: z.string().trim().min(2, "Mínimo 2 caracteres").max(80),
  price: z.string().min(1, "Informe o valor"),
  duration_days: z.coerce.number().int().min(1, "Mínimo 1 dia").max(3650),
  description: z.string().max(500).optional().or(z.literal("")),
  active: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

type Plan = {
  id: string;
  name: string;
  price_cents: number;
  duration_days: number;
  description: string | null;
  active: boolean;
  created_at: string;
};

function PlanosPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Plan[];
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", price: "", duration_days: 30, description: "", active: true },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({ name: "", price: "", duration_days: 30, description: "", active: true });
    setOpen(true);
  };
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

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!user) throw new Error("Sem sessão");
      const payload = {
        name: values.name.trim(),
        price_cents: parseBrlToCents(values.price),
        duration_days: values.duration_days,
        description: values.description?.trim() || null,
        active: values.active,
        user_id: user.id,
      };
      if (editing) {
        const { error } = await supabase.from("plans").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("plans").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Plano atualizado" : "Plano criado");
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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Planos</h1>
          <p className="text-muted-foreground mt-1">Defina os planos recorrentes oferecidos aos seus clientes.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="size-4" /> Novo plano
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar plano" : "Novo plano"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl><Input placeholder="Ex.: Plano Mensal" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="price" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor (R$)</FormLabel>
                      <FormControl><Input inputMode="decimal" placeholder="49,90" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="duration_days" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duração (dias)</FormLabel>
                      <FormControl><Input type="number" min={1} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl><Textarea rows={3} placeholder="Detalhes do plano" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="active" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel className="mb-0">Ativo</FormLabel>
                      <p className="text-xs text-muted-foreground">Planos inativos não aparecem ao cadastrar clientes.</p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )} />
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={save.isPending}>{save.isPending ? "Salvando..." : "Salvar"}</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}><Skeleton className="h-6 w-full" /></TableCell>
                </TableRow>
              ))}
              {!isLoading && data?.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Nenhum plano cadastrado ainda.</TableCell></TableRow>
              )}
              {data?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{brl(p.price_cents)}</TableCell>
                  <TableCell>{p.duration_days} dias</TableCell>
                  <TableCell>
                    <Badge variant={p.active ? "default" : "secondary"}>{p.active ? "Ativo" : "Inativo"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="size-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost"><Trash2 className="size-4 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir plano?</AlertDialogTitle>
                          <AlertDialogDescription>Esta ação não pode ser desfeita. Clientes vinculados perderão a referência ao plano.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove.mutate(p.id)}>Excluir</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
