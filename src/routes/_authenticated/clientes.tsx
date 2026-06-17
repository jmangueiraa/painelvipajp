import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { brl, parseBrlToCents, formatDateBR, todayISO, addDaysISO, formatPhone } from "@/lib/format";
import { statusLabel, statusVariant, computeStatus, type ClientStatus } from "@/lib/status";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Painel VIP" }] }),
  component: ClientesPage,
});

const schema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(120),
  phone: z.string().trim().min(8, "Telefone inválido").max(20),
  email: z.string().trim().email("Email inválido").max(255).optional().or(z.literal("")),
  doc: z.string().trim().max(20).optional().or(z.literal("")),
  address: z.string().trim().max(255).optional().or(z.literal("")),
  plan_id: z.string().optional(),
  price: z.string().min(1, "Informe o valor"),
  due_date: z.string().min(1, "Informe o vencimento"),
  status: z.enum(["ativo", "vencido", "suspenso", "cancelado"]),
  notes: z.string().max(500).optional().or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

type Plan = { id: string; name: string; price_cents: number; duration_days: number; active: boolean };
type Client = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  doc: string | null;
  address: string | null;
  plan_id: string | null;
  price_cents: number;
  due_date: string;
  status: ClientStatus;
  notes: string | null;
};

function ClientesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | ClientStatus>("todos");

  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("due_date", { ascending: true });
      if (error) throw error;
      return data as Client[];
    },
  });

  const { data: plans } = useQuery({
    queryKey: ["plans", "active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("id,name,price_cents,duration_days,active").eq("active", true).order("name");
      if (error) throw error;
      return data as Plan[];
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "", phone: "", email: "", doc: "", address: "",
      plan_id: undefined, price: "", due_date: todayISO(), status: "ativo", notes: "",
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({
      name: "", phone: "", email: "", doc: "", address: "",
      plan_id: undefined, price: "", due_date: todayISO(), status: "ativo", notes: "",
    });
    setOpen(true);
  };
  const openEdit = (c: Client) => {
    setEditing(c);
    form.reset({
      name: c.name, phone: c.phone, email: c.email ?? "", doc: c.doc ?? "", address: c.address ?? "",
      plan_id: c.plan_id ?? undefined,
      price: (c.price_cents / 100).toFixed(2).replace(".", ","),
      due_date: c.due_date, status: c.status, notes: c.notes ?? "",
    });
    setOpen(true);
  };

  const onPlanChange = (planId: string) => {
    form.setValue("plan_id", planId);
    const p = plans?.find((x) => x.id === planId);
    if (p) {
      form.setValue("price", (p.price_cents / 100).toFixed(2).replace(".", ","));
      if (!editing) form.setValue("due_date", addDaysISO(todayISO(), p.duration_days));
    }
  };

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!user) throw new Error("Sem sessão");
      const payload = {
        name: values.name.trim(),
        phone: values.phone.trim(),
        email: values.email?.trim() || null,
        doc: values.doc?.trim() || null,
        address: values.address?.trim() || null,
        plan_id: values.plan_id || null,
        price_cents: parseBrlToCents(values.price),
        due_date: values.due_date,
        status: computeStatus(values.due_date, values.status),
        notes: values.notes?.trim() || null,
        user_id: user.id,
      };
      if (editing) {
        const { error } = await supabase.from("clients").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clients").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Cliente atualizado" : "Cliente cadastrado");
      qc.invalidateQueries({ queryKey: ["clients"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente removido");
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    if (!clients) return [];
    const term = q.trim().toLowerCase();
    return clients.filter((c) => {
      if (statusFilter !== "todos" && c.status !== statusFilter) return false;
      if (!term) return true;
      return (
        c.name.toLowerCase().includes(term) ||
        c.phone.toLowerCase().includes(term) ||
        (c.email ?? "").toLowerCase().includes(term)
      );
    });
  }, [clients, q, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground mt-1">Cadastre e acompanhe os vencimentos dos seus clientes.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}><Plus className="size-4" /> Novo cliente</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome *</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone (WhatsApp) *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="(11) 99999-9999"
                          value={field.value}
                          onChange={(e) => field.onChange(formatPhone(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input type="email" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="doc" render={({ field }) => (
                    <FormItem>
                      <FormLabel>CPF/CNPJ</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="address" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Endereço</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField control={form.control} name="plan_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Plano</FormLabel>
                      <Select value={field.value ?? ""} onValueChange={onPlanChange}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {plans?.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">Crie um plano primeiro</div>}
                          {plans?.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name} — {brl(p.price_cents)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="price" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor (R$) *</FormLabel>
                      <FormControl><Input inputMode="decimal" placeholder="49,90" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="due_date" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vencimento *</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="vencido">Vencido</SelectItem>
                        <SelectItem value="suspenso">Suspenso</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações</FormLabel>
                    <FormControl><Textarea rows={3} {...field} /></FormControl>
                    <FormMessage />
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
        <CardContent className="p-4 space-y-4">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por nome, telefone ou email" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="ativo">Ativos</SelectItem>
                <SelectItem value="vencido">Vencidos</SelectItem>
                <SelectItem value="suspenso">Suspensos</SelectItem>
                <SelectItem value="cancelado">Cancelados</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                ))}
                {!isLoading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Nenhum cliente encontrado.</TableCell></TableRow>
                )}
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.phone}</TableCell>
                    <TableCell>{brl(c.price_cents)}</TableCell>
                    <TableCell>{formatDateBR(c.due_date)}</TableCell>
                    <TableCell><Badge variant={statusVariant[c.status]}>{statusLabel[c.status]}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="size-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost"><Trash2 className="size-4 text-destructive" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover {c.name}?</AlertDialogTitle>
                            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove.mutate(c.id)}>Remover</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
