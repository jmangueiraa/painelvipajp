import { useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, Save, LogOut, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { portalFetch } from "@/lib/portal-client";
import { normalizeEvolutionUrl } from "@/lib/evolution-api";

type Connection = { configured: boolean; connected: boolean; image?: string | null };
type Props = {
  baseUrl: string; instance: string; apiKey: string;
  setBaseUrl: (v: string) => void; setInstance: (v: string) => void; setApiKey: (v: string) => void;
  configured: boolean; showSecrets: boolean;
  status: UseQueryResult<Connection, Error>; qr: UseQueryResult<Connection, Error>;
  onChanged: () => void;
};
export function EvolutionPortalCard(props: Props) {
  const qc = useQueryClient();
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["portal", "admin", "evolution-status"] }); void qc.invalidateQueries({ queryKey: ["portal", "admin", "evolution-qr"] }); };
  const save = useMutation({
    mutationFn: async () => {
      const base_url = normalizeEvolutionUrl(props.baseUrl);
      await portalFetch("/api/public/portal/admin", { method: "POST", body: JSON.stringify({ action: "save_evolution", base_url, instance_name: props.instance, api_key: props.apiKey }) });
      return base_url;
    },
    onSuccess: (url) => { props.setBaseUrl(url); props.setApiKey(""); toast.success("Evolution API salva!"); refresh(); props.onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const disconnect = useMutation({
    mutationFn: () => portalFetch("/api/public/portal/admin", { method: "POST", body: JSON.stringify({ action: "evolution_disconnect" }) }),
    onSuccess: () => { refresh(); toast.success("WhatsApp desconectado"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const connected = props.status.data?.connected === true;
  return (
    <div className="evolution-portal-card rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-extrabold">WhatsApp (Evolution API)</p>
        <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${connected ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>{connected ? "Conectado" : "Desconectado"}</span>
      </div>
      <div className="space-y-1">
        <Label htmlFor="evolution-url" className="text-xs">URL Base da API</Label>
        <Input id="evolution-url" type="url" value={props.baseUrl} onChange={(e) => props.setBaseUrl(e.target.value)} placeholder="https://api.seudominio.com.br" autoComplete="off" className="evolution-portal-input" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="evolution-instance" className="text-xs">Nome da Instância</Label>
        <Input id="evolution-instance" value={props.instance} onChange={(e) => props.setInstance(e.target.value)} placeholder="ajpvip" autoComplete="off" className="evolution-portal-input" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="evolution-key" className="text-xs">Chave de API</Label>
        <Input id="evolution-key" type={props.showSecrets ? "text" : "password"} value={props.apiKey} onChange={(e) => props.setApiKey(e.target.value)} placeholder={props.configured ? "Chave salva — deixe vazio para manter" : "API Key da Evolution"} autoComplete="new-password" className="evolution-portal-input" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="invoice" className="h-9 rounded-xl text-xs font-bold" onClick={() => save.mutate()} disabled={save.isPending}><Save className="size-3.5" />{save.isPending ? "Salvando..." : "Salvar WhatsApp"}</Button>
        <Button size="sm" variant="outline" className="evolution-portal-input h-9 rounded-xl text-xs font-bold" onClick={refresh} disabled={props.status.isFetching || props.qr.isFetching}><RefreshCw className={`size-3.5 ${props.status.isFetching ? "animate-spin" : ""}`} />Status</Button>
        {connected && <Button size="sm" variant="outline" className="evolution-portal-input h-9 rounded-xl text-xs" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}><LogOut className="size-3.5" />Desconectar</Button>}
      </div>
      {(props.status.error || props.qr.error) && <p role="alert" className="text-xs text-destructive break-words">{props.status.error?.message ?? props.qr.error?.message}</p>}
      {props.qr.data?.image && !connected && <div className="pt-2 flex flex-col items-center gap-2"><img src={props.qr.data.image} alt="QR Code WhatsApp" className="w-44 h-44 rounded-xl border p-2" /><span className="text-[11px] flex items-center gap-1"><QrCode className="size-3.5" />Escaneie no WhatsApp → Aparelhos conectados</span></div>}
    </div>
  );
}