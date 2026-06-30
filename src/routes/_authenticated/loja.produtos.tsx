import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Upload, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { translateError } from "@/lib/translate-error";
import { brl } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/loja/produtos")({
  head: () => ({ meta: [{ title: "Produtos da Loja — Painel VIP" }] }),
  component: LojaProdutosPage,
});

type Product = {
  id: string;
  user_id: string;
  key: string;
  label: string;
  sale_cents: number;
  cost_cents: number;
  duration_days: number;
  emoji: string | null;
  gradient: string | null;
  sort_order: number;
  active: boolean;
  image_url: string | null;
};

type FormState = {
  id?: string;
  key: string;
  label: string;
  sale: string;
  cost: string;
  duration_days: string;
  emoji: string;
  active: boolean;
  image_url: string;
};

const empty: FormState = { key: "", label: "", sale: "", cost: "", duration_days: "30", emoji: "🛒", active: true, image_url: "" };

function toCents(s: string) {
  const n = Number(String(s).replace(",", ".").replace(/[^\d.]/g, ""));
  return Math.max(0, Math.round((Number.isFinite(n) ? n : 0) * 100));
}

function LojaProdutosPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);

  const { data = [], isLoading } = useQuery({
    queryKey: ["store_products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_products")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as Product[];
    },
  });

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      if (!user) throw new Error("Não autenticado");
      const payload = {
        user_id: user.id,
        key: f.key.trim() || `prod-${Date.now()}`,
        label: f.label.trim(),
        sale_cents: toCents(f.sale),
        cost_cents: toCents(f.cost),
        duration_days: Math.max(1, Number(f.duration_days) || 30),
        emoji: f.emoji || "🛒",
        active: f.active,
        image_url: f.image_url.trim() || null,
      };
      if (!payload.label) throw new Error("Nome do produto obrigatório");
      if (f.id) {
        const { error } = await supabase.from("store_products").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("store_products").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Produto salvo");
      setOpen(false);
      setForm(empty);
      qc.invalidateQueries({ queryKey: ["store_products"] });
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("store_products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produto removido");
      qc.invalidateQueries({ queryKey: ["store_products"] });
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  function openEdit(p: Product) {
    setForm({
      id: p.id,
      key: p.key,
      label: p.label,
      sale: (p.sale_cents / 100).toFixed(2),
      cost: (p.cost_cents / 100).toFixed(2),
      duration_days: String(p.duration_days),
      emoji: p.emoji ?? "🛒",
      active: p.active,
    });
    setOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produtos da Loja"
        description="Edite os produtos exibidos no Portal do Cliente e defina o custo para apurar o lucro."
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(empty); }}>
            <DialogTrigger asChild>
              <Button onClick={() => { setForm(empty); setOpen(true); }}><Plus className="mr-1 h-4 w-4" />Novo produto</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{form.id ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div className="grid grid-cols-[80px_1fr] gap-3">
                  <div>
                    <Label>Emoji</Label>
                    <Input value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} maxLength={4} />
                  </div>
                  <div>
                    <Label>Nome</Label>
                    <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="ChatGPT Plus - 30 dias" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Venda (R$)</Label>
                    <Input inputMode="decimal" value={form.sale} onChange={(e) => setForm({ ...form, sale: e.target.value })} placeholder="30,00" />
                  </div>
                  <div>
                    <Label>Custo (R$)</Label>
                    <Input inputMode="decimal" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="0,00" />
                  </div>
                  <div>
                    <Label>Validade (dias)</Label>
                    <Input inputMode="numeric" value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: e.target.value })} />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label htmlFor="active">Ativo (exibir no portal)</Label>
                  <Switch id="active" checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => save.mutate(form)} disabled={save.isPending}>Salvar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
          ) : data.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhum produto cadastrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="p-3">Produto</th>
                    <th className="p-3">Venda</th>
                    <th className="p-3">Custo</th>
                    <th className="p-3">Lucro</th>
                    <th className="p-3">Validade</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{p.emoji ?? "🛒"}</span>
                          <span className="font-medium">{p.label}</span>
                        </div>
                      </td>
                      <td className="p-3 tabular-nums">{brl(p.sale_cents)}</td>
                      <td className="p-3 tabular-nums">{brl(p.cost_cents)}</td>
                      <td className="p-3 tabular-nums font-semibold text-emerald-600">{brl(p.sale_cents - p.cost_cents)}</td>
                      <td className="p-3">{p.duration_days} dias</td>
                      <td className="p-3">
                        <Badge variant={p.active ? "default" : "secondary"}>{p.active ? "Ativo" : "Inativo"}</Badge>
                      </td>
                      <td className="p-3 text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Excluir ${p.label}?`)) remove.mutate(p.id); }}><Trash2 className="h-4 w-4" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
