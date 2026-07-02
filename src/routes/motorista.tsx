import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  LogOut,
  MapPin,
  Navigation,
  CheckCircle2,
  XCircle,
  Phone,
  Camera,
  Truck,
  Package,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/motorista")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "App do Motorista" },
      { name: "description", content: "Rotas e entregas do dia." },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#22C55E" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Motorista" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "manifest", href: "/motorista-manifest.webmanifest?v=1" },
      { rel: "apple-touch-icon", href: "/portal-icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/portal-icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/portal-icon-512.png" },
    ],
  }),
  component: MotoristaApp,
});

type Driver = {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  vehicle: string | null;
};

type Delivery = {
  id: string;
  customer_name: string;
  phone: string | null;
  address: string;
  neighborhood: string | null;
  city: string | null;
  zip: string | null;
  status: string;
  sequence: number | null;
  value_cents: number;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  window_start: string | null;
  window_end: string | null;
  route_id: string | null;
};

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

function MotoristaApp() {
  const [checking, setChecking] = useState(true);
  const [driver, setDriver] = useState<Driver | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        if (mounted) setChecking(false);
        return;
      }
      await tryLoadDriver(mounted, setDriver);
      if (mounted) setChecking(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setDriver(null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  if (!driver) return <LoginView onLoggedIn={setDriver} />;

  return <DashboardView driver={driver} onLogout={() => setDriver(null)} />;
}

async function tryLoadDriver(
  mounted: boolean,
  setDriver: (d: Driver | null) => void,
) {
  const { data } = await supabase
    .from("drivers")
    .select("id, user_id, name, email, phone, vehicle")
    .eq("auth_user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();
  if (mounted && data) setDriver(data as Driver);
}

// ---------- Login ----------
function LoginView({ onLoggedIn }: { onLoggedIn: (d: Driver) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/motorista` },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      // Link driver
      const { data, error: linkErr } = await supabase.rpc("link_driver_to_current_user", {
        _email: email,
      });
      if (linkErr) throw linkErr;
      onLoggedIn(data as Driver);
      toast.success(`Olá, ${(data as Driver).name}!`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha no login";
      toast.error(msg.includes("não cadastrado") ? "Motorista não cadastrado. Peça acesso ao gestor." : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm bg-slate-900/80 border-slate-800">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 h-14 w-14 rounded-2xl bg-green-500/20 flex items-center justify-center">
            <Truck className="h-7 w-7 text-green-500" />
          </div>
          <CardTitle className="text-white">App do Motorista</CardTitle>
          <p className="text-sm text-slate-400 mt-1">Entre com o e-mail cadastrado pelo gestor</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label className="text-slate-300">E-mail</Label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div>
              <Label className="text-slate-300">Senha</Label>
              <Input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <Button type="submit" className="w-full bg-green-600 hover:bg-green-500" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "login" ? "Entrar" : "Criar conta"}
            </Button>
            <button
              type="button"
              className="w-full text-xs text-slate-400 hover:text-slate-200"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
            >
              {mode === "login" ? "Primeiro acesso? Criar conta" : "Já tenho conta"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Dashboard ----------
function DashboardView({ driver, onLogout }: { driver: Driver; onLogout: () => void }) {
  const [items, setItems] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Delivery | null>(null);
  const [action, setAction] = useState<"delivered" | "failed" | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refresh() {
    setLoading(true);
    const { data } = await supabase
      .from("deliveries")
      .select("id, customer_name, phone, address, neighborhood, city, zip, status, sequence, value_cents, lat, lng, notes, window_start, window_end, route_id")
      .eq("driver_id", driver.id)
      .in("status", ["pending", "in_route", "delivered", "failed"])
      .order("sequence", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    setItems((data ?? []) as Delivery[]);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // Location ping every 30s while there are non-final deliveries
    pingTimer.current = setInterval(() => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          await supabase.from("driver_locations").insert({
            user_id: driver.user_id,
            driver_id: driver.id,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? null,
            heading: pos.coords.heading ?? null,
            speed: pos.coords.speed ?? null,
          });
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 8000 },
      );
    }, 30_000);
    return () => {
      if (pingTimer.current) clearInterval(pingTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver.id]);

  const pending = useMemo(() => items.filter((i) => i.status === "pending" || i.status === "in_route"), [items]);
  const done = useMemo(() => items.filter((i) => i.status === "delivered" || i.status === "failed"), [items]);

  async function logout() {
    await supabase.auth.signOut();
    onLogout();
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-400">Motorista</div>
          <div className="font-semibold leading-tight">{driver.name}</div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="icon" variant="ghost" onClick={logout}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2 px-4 pt-4">
        <StatCard label="A fazer" value={pending.length} tone="blue" icon={<Package className="h-4 w-4" />} />
        <StatCard label="Entregues" value={items.filter((i) => i.status === "delivered").length} tone="green" icon={<CheckCircle2 className="h-4 w-4" />} />
        <StatCard label="Problemas" value={items.filter((i) => i.status === "failed").length} tone="red" icon={<XCircle className="h-4 w-4" />} />
      </div>

      {/* List */}
      <div className="px-4 pt-4 space-y-3">
        {loading && items.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            Carregando entregas…
          </div>
        )}
        {!loading && items.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-60" />
            Nenhuma entrega atribuída ainda.
          </div>
        )}
        {pending.map((d) => (
          <DeliveryCard
            key={d.id}
            d={d}
            onOpen={() => setSelected(d)}
            onStart={async () => {
              await supabase.from("deliveries").update({ status: "in_route" }).eq("id", d.id);
              refresh();
            }}
          />
        ))}
        {done.length > 0 && (
          <>
            <div className="pt-6 text-xs uppercase tracking-wide text-slate-500">Finalizadas hoje</div>
            {done.map((d) => (
              <DeliveryCard key={d.id} d={d} onOpen={() => setSelected(d)} compact />
            ))}
          </>
        )}
      </div>

      {/* Details / actions */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.customer_name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2 text-slate-300">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <div>{selected.address}</div>
                    <div className="text-slate-400 text-xs">
                      {[selected.neighborhood, selected.city, selected.zip].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </div>
                {selected.value_cents > 0 && (
                  <div className="text-slate-300">Valor: <strong>{brl(selected.value_cents)}</strong></div>
                )}
                {selected.notes && <div className="text-slate-400">Obs: {selected.notes}</div>}
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const q = selected.lat && selected.lng
                        ? `${selected.lat},${selected.lng}`
                        : encodeURIComponent([selected.address, selected.neighborhood, selected.city].filter(Boolean).join(", "));
                      window.open(`https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`, "_blank");
                    }}
                  >
                    <Navigation className="h-4 w-4 mr-2" /> Rota
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!selected.phone}
                    onClick={() => selected.phone && window.open(`https://wa.me/${selected.phone.replace(/\D/g, "")}`, "_blank")}
                  >
                    <Phone className="h-4 w-4 mr-2" /> WhatsApp
                  </Button>
                </div>
              </div>
              <DialogFooter className="grid grid-cols-2 gap-2 sm:flex-none">
                <Button
                  variant="destructive"
                  onClick={() => setAction("failed")}
                  disabled={selected.status === "delivered"}
                >
                  <XCircle className="h-4 w-4 mr-2" /> Problema
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-500"
                  onClick={() => setAction("delivered")}
                  disabled={selected.status === "delivered"}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Entregue
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <FinalizeDialog
        driver={driver}
        delivery={selected}
        action={action}
        onClose={() => setAction(null)}
        onDone={() => {
          setAction(null);
          setSelected(null);
          refresh();
        }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "blue" | "green" | "red";
  icon: React.ReactNode;
}) {
  const toneMap = {
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    green: "bg-green-500/10 text-green-400 border-green-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
  } as const;
  return (
    <div className={`rounded-xl border p-3 ${toneMap[tone]}`}>
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide">
        {icon} {label}
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function DeliveryCard({
  d,
  onOpen,
  onStart,
  compact,
}: {
  d: Delivery;
  onOpen: () => void;
  onStart?: () => void;
  compact?: boolean;
}) {
  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0" onClick={onOpen}>
            <div className="flex items-center gap-2">
              {d.sequence && (
                <span className="h-6 w-6 rounded-full bg-slate-800 text-xs flex items-center justify-center text-slate-300 shrink-0">
                  {d.sequence}
                </span>
              )}
              <div className="font-medium truncate">{d.customer_name}</div>
            </div>
            <div className="text-xs text-slate-400 mt-1 truncate">{d.address}</div>
            {!compact && (
              <div className="text-xs text-slate-500 truncate">
                {[d.neighborhood, d.city].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
          <Badge variant="outline" className={STATUS_COLOR[d.status] ?? ""}>
            {STATUS_LABEL[d.status] ?? d.status}
          </Badge>
        </div>
        {!compact && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const q = d.lat && d.lng
                  ? `${d.lat},${d.lng}`
                  : encodeURIComponent([d.address, d.neighborhood, d.city].filter(Boolean).join(", "));
                window.open(`https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`, "_blank");
              }}
            >
              <Navigation className="h-4 w-4" />
            </Button>
            {d.status === "pending" && onStart ? (
              <Button size="sm" className="col-span-2 bg-yellow-600 hover:bg-yellow-500" onClick={onStart}>
                Iniciar
              </Button>
            ) : (
              <Button size="sm" className="col-span-2 bg-green-600 hover:bg-green-500" onClick={onOpen}>
                Finalizar
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FinalizeDialog({
  driver,
  delivery,
  action,
  onClose,
  onDone,
}: {
  driver: Driver;
  delivery: Delivery | null;
  action: "delivered" | "failed" | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [receivedBy, setReceivedBy] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!action) {
      setPhoto(null);
      setReceivedBy("");
      setReason("");
    }
  }, [action]);

  async function submit() {
    if (!delivery || !action) return;
    setBusy(true);
    try {
      let position: GeolocationPosition | null = null;
      try {
        position = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 6000 }),
        );
      } catch { /* ignore */ }

      let photoPath: string | null = null;
      if (action === "delivered" && photo) {
        const ext = photo.name.split(".").pop() || "jpg";
        const path = `${driver.user_id}/${delivery.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("delivery-proofs").upload(path, photo, {
          contentType: photo.type,
          upsert: true,
        });
        if (upErr) throw upErr;
        photoPath = path;
      }

      if (action === "delivered") {
        const { error } = await supabase.from("delivery_proofs").insert({
          user_id: driver.user_id,
          delivery_id: delivery.id,
          photo_path: photoPath,
          received_by: receivedBy || null,
          lat: position?.coords.latitude ?? null,
          lng: position?.coords.longitude ?? null,
        });
        if (error) throw error;
        await supabase
          .from("deliveries")
          .update({ status: "delivered", delivered_at: new Date().toISOString() })
          .eq("id", delivery.id);
      } else {
        await supabase
          .from("deliveries")
          .update({ status: "failed", failure_reason: reason || "Não especificado" })
          .eq("id", delivery.id);
      }

      await supabase.from("delivery_logs").insert({
        user_id: driver.user_id,
        driver_id: driver.id,
        delivery_id: delivery.id,
        route_id: delivery.route_id,
        action: action === "delivered" ? "delivered" : "failed",
        details: { received_by: receivedBy, reason, has_photo: !!photoPath },
      });

      toast.success(action === "delivered" ? "Entrega confirmada!" : "Problema registrado");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!action} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>
            {action === "delivered" ? "Confirmar entrega" : "Registrar problema"}
          </DialogTitle>
        </DialogHeader>
        {action === "delivered" ? (
          <div className="space-y-3">
            <div>
              <Label className="text-slate-300">Recebido por</Label>
              <Input
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                placeholder="Nome de quem recebeu"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div>
              <Label className="text-slate-300 flex items-center gap-2">
                <Camera className="h-4 w-4" /> Foto (opcional)
              </Label>
              <Input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                className="bg-slate-800 border-slate-700 text-white file:text-slate-300"
              />
            </div>
          </div>
        ) : (
          <div>
            <Label className="text-slate-300">Motivo</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Cliente ausente, endereço errado…"
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            className={action === "delivered" ? "bg-green-600 hover:bg-green-500" : "bg-red-600 hover:bg-red-500"}
            onClick={submit}
            disabled={busy}
          >
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
