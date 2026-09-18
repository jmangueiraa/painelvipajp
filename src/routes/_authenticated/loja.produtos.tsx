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
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 5MB)");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("store-products").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("store-products").getPublicUrl(path);
      setForm((f) => ({ ...f, image_url: data.publicUrl }));
      toast.success("Imagem enviada");
    } catch (e) {
      toast.error(translateError(e as Error));
    } finally {
      setUploading(false);
    }
  }


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
      image_url: p.image_url ?? "",
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
              <Button onClick={() => { setForm(empty); setOpen(true); }} className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium">
                <Plus className="mr-1.5 h-4 w-4" />Novo produto
              </Button>
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
                <div>
                  <Label>Foto do produto</Label>
                  <div className="mt-1 flex items-center gap-3">
                    {form.image_url ? (
                      <div className="relative">
                        <img src={form.image_url} alt="" className="h-20 w-20 rounded-lg object-cover border border-zinc-800" />
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, image_url: "" })}
                          className="absolute -top-2 -right-2 rounded-full bg-rose-500 text-white p-0.5"
                          aria-label="Remover imagem"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="h-20 w-20 rounded-lg border border-dashed border-zinc-800 flex items-center justify-center text-2xl bg-zinc-950/40">
                        {form.emoji || "🛒"}
                      </div>
                    )}
                    <div className="flex-1">
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUpload(f);
                          e.target.value = "";
                        }}
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                        {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
                        {form.image_url ? "Trocar imagem" : "Enviar imagem"}
                      </Button>
                      <p className="mt-1 text-xs text-zinc-400">PNG ou JPG, até 5MB. Se vazio, usa o emoji.</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 p-3.5">
                  <Label htmlFor="active" className="text-zinc-200">Ativo (exibir no portal)</Label>
                  <Switch id="active" checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
                </div>
              </div>
              <DialogFooter>
                <Button className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium" onClick={() => save.mutate(form)} disabled={save.isPending}>Salvar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-sm text-zinc-500">Carregando…</p>
          ) : data.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500 text-center py-8">Nenhum produto cadastrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900/40 text-left text-xs uppercase tracking-wider text-zinc-400 border-b border-zinc-800/60">
                  <tr>
                    <th className="p-3 font-medium">Produto</th>
                    <th className="p-3 font-medium">Venda</th>
                    <th className="p-3 font-medium">Custo</th>
                    <th className="p-3 font-medium">Lucro</th>
                    <th className="p-3 font-medium">Validade</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {data.map((p) => (
                    <tr key={p.id} className="hover:bg-zinc-900/40 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          {p.image_url ? (
                            <img src={p.image_url} alt="" className="h-10 w-10 rounded-lg object-cover border border-zinc-800" />
                          ) : (
                            <span className="text-xl w-10 text-center">{p.emoji ?? "🛒"}</span>
                          )}
                          <span className="font-medium text-zinc-100">{p.label}</span>
                        </div>
                      </td>
                      <td className="p-3 tabular-nums text-zinc-300">{brl(p.sale_cents)}</td>
                      <td className="p-3 tabular-nums text-zinc-400">{brl(p.cost_cents)}</td>
                      <td className="p-3 tabular-nums font-semibold text-emerald-400">{brl(p.sale_cents - p.cost_cents)}</td>
                      <td className="p-3 text-zinc-400">{p.duration_days} dias</td>
                      <td className="p-3">
                        <Badge variant={p.active ? "emerald" : "neutral"}>{p.active ? "Ativo" : "Inativo"}</Badge>
                      </td>
                      <td className="p-3 text-right">
                        <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-zinc-100" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-rose-400" onClick={() => { if (confirm(`Excluir ${p.label}?`)) remove.mutate(p.id); }}><Trash2 className="h-4 w-4" /></Button>
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
