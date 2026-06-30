import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  getStorePublic,
  getMyStoreData,
  createStorePayment,
  getStoreOrderStatus,
} from "@/lib/store-public.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Copy, ShoppingBag, LogOut, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/loja/$slug")({
  ssr: false,
  component: StorePage,
});

const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function StorePage() {
  const { slug } = Route.useParams();
  const fetchStore = useServerFn(getStorePublic);
  const fetchMine = useServerFn(getMyStoreData);
  const createPayment = useServerFn(createStorePayment);
  const checkStatus = useServerFn(getStoreOrderStatus);
  const qc = useQueryClient();

  const [session, setSession] = useState<{ user: { id: string; email?: string } } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ? { user: { id: data.session.user.id, email: data.session.user.email } } : null);
      setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s ? { user: { id: s.user.id, email: s.user.email } } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const storeQ = useQuery({
    queryKey: ["store-public", slug],
    queryFn: () => fetchStore({ data: { slug } }),
  });

  const mineQ = useQuery({
    queryKey: ["store-mine", slug, session?.user.id],
    enabled: !!session,
    queryFn: () => fetchMine({ data: { slug } }),
  });

  if (storeQ.isLoading || !authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!storeQ.data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="p-8 text-center max-w-md">
          <h1 className="text-xl font-semibold mb-2">Loja não encontrada</h1>
          <p className="text-muted-foreground text-sm">O link <span className="font-mono">/loja/{slug}</span> não corresponde a nenhuma loja ativa.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/40">
      <header className="px-4 py-6 max-w-3xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">{storeQ.data.title}</h1>
            {storeQ.data.description && (
              <p className="text-xs text-muted-foreground">{storeQ.data.description}</p>
            )}
          </div>
        </div>
        {session && (
          <Button variant="ghost" size="sm" onClick={async () => { await supabase.auth.signOut(); qc.clear(); }}>
            <LogOut className="w-4 h-4 mr-1" /> Sair
          </Button>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-4 pb-20 space-y-6">
        {!session ? (
          <AuthBox slug={slug} />
        ) : (
          <Authed
            slug={slug}
            email={session.user.email ?? ""}
            store={storeQ.data}
            mine={mineQ.data}
            mineLoading={mineQ.isLoading}
            createPayment={createPayment}
            checkStatus={checkStatus}
            refetchMine={() => qc.invalidateQueries({ queryKey: ["store-mine", slug] })}
          />
        )}
      </main>
    </div>
  );
}

function AuthBox({ slug }: { slug: string }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      if (mode === "signup") {
        if (!name.trim()) throw new Error("Informe seu nome");
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name, phone },
            emailRedirectTo: `${window.location.origin}/loja/${slug}`,
          },
        });
        if (error) throw error;
        toast.success("Cadastro criado. Você já pode entrar.");
        setMode("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex gap-2">
        <Button variant={mode === "login" ? "default" : "outline"} className="flex-1 rounded-full" onClick={() => setMode("login")}>
          Entrar
        </Button>
        <Button variant={mode === "signup" ? "default" : "outline"} className="flex-1 rounded-full" onClick={() => setMode("signup")}>
          Criar conta
        </Button>
      </div>
      <div className="space-y-3">
        {mode === "signup" && (
          <>
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
            </div>
            <div className="space-y-1">
              <Label>WhatsApp</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
            </div>
          </>
        )}
        <div className="space-y-1">
          <Label>E-mail</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" autoComplete="email" />
        </div>
        <div className="space-y-1">
          <Label>Senha</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === "login" ? "current-password" : "new-password"} />
        </div>
        <Button className="btn-premium w-full rounded-full" onClick={submit} disabled={loading || !email || !password}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "login" ? "Entrar" : "Criar conta"}
        </Button>
      </div>
    </Card>
  );
}

type Product = { key: string; label: string; sale_cents: number; emoji: string | null; gradient: string | null; image_url: string | null };
type StoreData = { owner_id: string; title: string; description: string | null; products: Product[] };
type MineData = Awaited<ReturnType<typeof getMyStoreData>>;

function Authed({
  slug, email, store, mine, mineLoading, createPayment, checkStatus, refetchMine,
}: {
  slug: string;
  email: string;
  store: StoreData;
  mine: MineData | undefined;
  mineLoading: boolean;
  createPayment: (opts: { data: { slug: string; product_key: string; method: "pix" | "card" } }) => Promise<Awaited<ReturnType<typeof createStorePayment>>>;
  checkStatus: (opts: { data: { renewal_id: string } }) => Promise<Awaited<ReturnType<typeof getStoreOrderStatus>>>;
  refetchMine: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [method, setMethod] = useState<"pix" | "card" | null>(null);
  const [busy, setBusy] = useState(false);
  const [renewalId, setRenewalId] = useState<string | null>(null);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [pixPayload, setPixPayload] = useState("");
  const [status, setStatus] = useState<"pending" | "approved">("pending");
  const [, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reset = () => {
    setProduct(null);
    setMethod(null);
    setRenewalId(null);
    setQrBase64(null);
    setPixPayload("");
    setStatus("pending");
    setCopied(false);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  useEffect(() => {
    if (!renewalId || status === "approved") return;
    pollRef.current = setInterval(async () => {
      const r = await checkStatus({ data: { renewal_id: renewalId } });
      if (r.ok && r.status === "paid") {
        setStatus("approved");
        refetchMine();
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    }, 4000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [renewalId, status, checkStatus, refetchMine]);

  const startPayment = async (m: "pix" | "card") => {
    if (!product) return;
    setMethod(m);
    setBusy(true);
    try {
      const r = await createPayment({ data: { slug, product_key: product.key, method: m } });
      if (!r.ok) throw new Error(r.error);
      setRenewalId(r.renewal_id);
      if (m === "pix") {
        setQrBase64(r.qr_code_base64 ?? null);
        setPixPayload(r.qr_code ?? "");
      } else if (r.init_point) {
        window.open(r.init_point, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      toast.error((e as Error).message);
      setMethod(null);
    } finally {
      setBusy(false);
    }
  };

  const requests = useMemo(() => (mine?.ok ? mine.requests : []), [mine]);

  return (
    <>
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold flex items-center gap-2"><ShoppingBag className="w-4 h-4" /> Produtos</h2>
            <p className="text-xs text-muted-foreground">Entrar como {email}</p>
          </div>
        </div>
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1">
          {store.products.map((p) => (
            <button
              key={p.key}
              onClick={() => { setProduct(p); setOpen(true); }}
              className={`snap-start shrink-0 w-40 rounded-2xl overflow-hidden bg-gradient-to-br ${p.gradient ?? "from-emerald-500 to-teal-600"} text-white text-left shadow-lg active:scale-95 transition`}
            >
              <div className="aspect-square flex items-center justify-center bg-black/10">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.label} className="w-full h-full object-cover" />
                ) : (
                  <ShoppingBag className="w-12 h-12 opacity-80" />
                )}
              </div>

              <div className="p-3">
                <p className="text-xs font-medium leading-tight line-clamp-2 min-h-[2.5rem]">{p.label}</p>
                <p className="text-base font-bold mt-1">{formatBRL(p.sale_cents)}</p>
              </div>
            </button>
          ))}
          {store.products.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 px-4">Nenhum produto disponível no momento.</p>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Meus pedidos</h2>
        {mineLoading ? (
          <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma compra ainda.</p>
        ) : (
          <ul className="space-y-2">
            {requests.map((r) => {
              const isPaid = r.status === "paid";
              const isAwait = r.status === "awaiting_payment";
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border bg-card">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{r.label ?? "Produto"}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">{formatBRL(r.amount_cents ?? 0)}</p>
                    <Badge variant={isPaid ? "default" : isAwait ? "outline" : "secondary"} className="text-[10px]">
                      {isPaid ? "Pago" : isAwait ? "Aguardando" : r.status}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">{product?.emoji ?? "🛒"}</span>
              {product?.label}
            </DialogTitle>
            <DialogDescription>
              {product && <>Valor: <strong>{formatBRL(product.sale_cents)}</strong></>}
            </DialogDescription>
          </DialogHeader>

          {status === "approved" ? (
            <div className="text-center py-8 space-y-3">
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
              <h3 className="font-semibold text-lg">Pagamento confirmado!</h3>
              <p className="text-sm text-muted-foreground">
                Seu pedido foi enviado ao revendedor. O acesso será entregue pelo WhatsApp em breve.
              </p>
              <Button className="w-full rounded-full" onClick={() => { setOpen(false); reset(); }}>Fechar</Button>
            </div>
          ) : !method ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Escolha o método de pagamento:</p>
              <Button className="w-full justify-between rounded-full" onClick={() => startPayment("pix")} disabled={busy}>
                <span>PIX</span>
                <span className="text-xs">à vista, sem taxa</span>
              </Button>
              <Button variant="outline" className="w-full justify-between rounded-full" onClick={() => startPayment("card")} disabled={busy}>
                <span>Cartão</span>
                <span className="text-xs">até 12x (taxa 4,99%)</span>
              </Button>
            </div>
          ) : method === "pix" ? (
            <div className="space-y-3">
              {busy && <div className="py-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>}
              {qrBase64 && (
                <>
                  <div className="bg-white p-3 rounded-xl flex justify-center">
                    <img src={`data:image/png;base64,${qrBase64}`} alt="QR PIX" className="w-56 h-56" />
                  </div>
                  <div className="flex gap-2">
                    <Input value={pixPayload} readOnly className="text-xs font-mono" />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => { navigator.clipboard.writeText(pixPayload); setCopied(true); toast.success("Copiado!"); }}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> Aguardando pagamento...
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3 py-4 text-center">
              <p className="text-sm">Abrimos o checkout do cartão em nova aba.</p>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" /> Aguardando confirmação...
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
