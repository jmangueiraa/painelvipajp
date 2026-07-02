import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, MapPin, Zap, Trash2, Loader2, Truck, CheckCircle2, AlertCircle, Clock, User, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { translateError } from "@/lib/translate-error";
import { brl, parseBrlToCents } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { DeliveriesMap } from "@/components/deliveries/deliveries-map";
import { geocodePendingDeliveries, optimizeRoute } from "@/lib/deliveries.functions";

export const Route = createFileRoute("/_authenticated/entregas")({
  component: EntregasPage,
});

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  in_route: "Em rota",
  delivered: "Entregue",
  failed: "Problema",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  in_route: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  delivered: "bg-green-500/15 text-green-600 border-green-500/30",
  failed: "bg-red-500/15 text-red-500 border-red-500/30",
};

function EntregasPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const geocodeFn = useServerFn(geocodePendingDeliveries);
  const optimizeFn = useServerFn(optimizeRoute);

  const { data: deliveries = [] } = useQuery({
    queryKey: ["deliveries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deliveries")
        .select("*")
        .order("sequence", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: routes = [] } = useQuery({
    queryKey: ["delivery_routes"],
    queryFn: async () => {
      const { data } = await supabase.from("delivery_routes").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ["drivers"],
    queryFn: async () => {
      const { data } = await supabase.from("drivers").select("*").order("name");
      return data ?? [];
    },
  });

  const stats = useMemo(() => {
    const s = { pending: 0, in_route: 0, delivered: 0, failed: 0, total: deliveries.length };
    for (const d of deliveries) s[d.status as keyof typeof s] = ((s[d.status as keyof typeof s] as number) ?? 0) + 1;
    const pct = s.total ? Math.round((s.delivered / s.total) * 100) : 0;
    return { ...s, pct };
  }, [deliveries]);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("deliveries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Entrega excluída"); qc.invalidateQueries({ queryKey: ["deliveries"] }); },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const changeStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("deliveries").update({ status, delivered_at: status === "delivered" ? new Date().toISOString() : null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deliveries"] }),
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const assignDriver = useMutation({
    mutationFn: async ({ id, driver_id }: { id: string; driver_id: string | null }) => {
      const { error } = await supabase.from("deliveries").update({ driver_id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deliveries"] }),
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const geocode = useMutation({
    mutationFn: async () => await geocodeFn({}),
    onSuccess: (r) => { toast.success(`Geocodificadas: ${r.ok} · Falhas: ${r.fail}`); qc.invalidateQueries({ queryKey: ["deliveries"] }); },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const optimize = useMutation({
    mutationFn: async (routeId: string) => await optimizeFn({ data: { routeId } }),
    onSuccess: (r) => {
      toast.success(`Rota otimizada: ${(r.distanceMeters / 1000).toFixed(1)} km · ${Math.round(r.durationSeconds / 60)} min`);
      qc.invalidateQueries({ queryKey: ["deliveries"] });
      qc.invalidateQueries({ queryKey: ["delivery_routes"] });
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const createRoute = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirada");
      const pendingIds = deliveries.filter((d) => d.status === "pending" && !d.route_id).map((d) => d.id);
      if (pendingIds.length === 0) throw new Error("Nenhuma entrega pendente sem rota");
      const { data: route, error } = await supabase
        .from("delivery_routes")
        .insert({ user_id: u.user.id, name: `Rota ${new Date().toLocaleDateString("pt-BR")}`, status: "draft" })
        .select("id").single();
      if (error) throw error;
      await supabase.from("deliveries").update({ route_id: route.id }).in("id", pendingIds);
      return route.id;
    },
    onSuccess: () => {
      toast.success("Rota criada com todas as entregas pendentes");
      qc.invalidateQueries({ queryKey: ["deliveries"] });
      qc.invalidateQueries({ queryKey: ["delivery_routes"] });
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Entregas"
        description="Cadastre paradas, monte rotas e otimize com Google Maps"
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => geocode.mutate()} disabled={geocode.isPending}>
              {geocode.isPending ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
              Geocodificar
            </Button>
            <Button variant="outline" onClick={() => createRoute.mutate()} disabled={createRoute.isPending}>
              <Truck className="size-4" /> Nova rota
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="size-4" /> Nova entrega</Button>
              </DialogTrigger>
              <DeliveryFormDialog onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["deliveries"] }); }} />
            </Dialog>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Pendentes" value={String(stats.pending)} icon={Clock} />
        <KpiCard label="Em rota" value={String(stats.in_route)} icon={Truck} />
        <KpiCard label="Entregues" value={String(stats.delivered)} icon={CheckCircle2} />
        <KpiCard label="Concluído" value={`${stats.pct}%`} icon={AlertCircle} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Mapa</CardTitle>
          <div className="text-xs text-muted-foreground flex gap-3 flex-wrap">
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-blue-500" /> Pendente</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-yellow-500" /> Em rota</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-green-500" /> Entregue</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-red-500" /> Problema</span>
          </div>
        </CardHeader>
        <CardContent>
          <DeliveriesMap deliveries={deliveries as any} />
        </CardContent>
      </Card>

      {routes.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Rotas</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {routes.map((r: any) => {
              const stops = deliveries.filter((d: any) => d.route_id === r.id);
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {stops.length} paradas
                      {r.distance_meters ? ` · ${(r.distance_meters / 1000).toFixed(1)} km` : ""}
                      {r.duration_seconds ? ` · ${Math.round(r.duration_seconds / 60)} min` : ""}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => optimize.mutate(r.id)} disabled={optimize.isPending}>
                    {optimize.isPending ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
                    Otimizar
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Entregas</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {deliveries.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma entrega cadastrada.</p>}
          {deliveries.map((d: any) => (
            <div key={d.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border border-border">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {d.sequence && <span className="text-xs font-bold text-muted-foreground">#{d.sequence}</span>}
                  <span className="font-medium truncate">{d.customer_name}</span>
                  <Badge variant="outline" className={STATUS_COLOR[d.status]}>{STATUS_LABEL[d.status]}</Badge>
                  {d.lat == null && <Badge variant="outline" className="text-xs">sem GPS</Badge>}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {d.address}{d.neighborhood ? `, ${d.neighborhood}` : ""}{d.city ? ` - ${d.city}` : ""}
                </div>
                {d.phone && <div className="text-xs text-muted-foreground">{d.phone}{d.value_cents ? ` · ${brl(d.value_cents)}` : ""}</div>}
              </div>
              <div className="flex items-center gap-2">
                <Select value={d.status} onValueChange={(v) => changeStatus.mutate({ id: d.id, status: v })}>
                  <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="in_route">Em rota</SelectItem>
                    <SelectItem value="delivered">Entregue</SelectItem>
                    <SelectItem value="failed">Problema</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="icon" variant="ghost" onClick={() => { if (confirm("Excluir?")) del.mutate(d.id); }}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function DeliveryFormDialog({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    customer_name: "", phone: "", address: "", neighborhood: "", city: "", zip: "",
    notes: "", window_start: "", window_end: "", value: "",
  });
  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirada");
      if (!form.customer_name || !form.address) throw new Error("Nome e endereço são obrigatórios");
      const { error } = await supabase.from("deliveries").insert({
        user_id: u.user.id,
        customer_name: form.customer_name,
        phone: form.phone || null,
        address: form.address,
        neighborhood: form.neighborhood || null,
        city: form.city || null,
        zip: form.zip || null,
        notes: form.notes || null,
        window_start: form.window_start || null,
        window_end: form.window_end || null,
        value_cents: form.value ? parseBrlToCents(form.value) : 0,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Entrega cadastrada"); onDone(); },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Nova entrega</DialogTitle></DialogHeader>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <Label>Cliente *</Label>
          <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
        </div>
        <div>
          <Label>Telefone</Label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <Label>Valor</Label>
          <Input placeholder="R$ 0,00" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <Label>Endereço *</Label>
          <Input placeholder="Rua, número" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div>
          <Label>Bairro</Label>
          <Input value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} />
        </div>
        <div>
          <Label>Cidade</Label>
          <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
        <div>
          <Label>CEP</Label>
          <Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} />
        </div>
        <div>
          <Label>Janela início</Label>
          <Input type="time" value={form.window_start} onChange={(e) => setForm({ ...form, window_start: e.target.value })} />
        </div>
        <div>
          <Label>Janela fim</Label>
          <Input type="time" value={form.window_end} onChange={(e) => setForm({ ...form, window_end: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <Label>Observações</Label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />} Salvar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
