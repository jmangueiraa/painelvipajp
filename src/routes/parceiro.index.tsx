import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Gift, Users, DollarSign, Wallet, CalendarRange, QrCode, Trophy,
  Copy, Check, Share2, LogOut, ExternalLink, ArrowRight, CheckCircle2,
  Clock, RefreshCw, Send, Smartphone, ShieldCheck, HelpCircle, Loader2
} from "lucide-react";

import {
  getPartnerDashboardStatsFn,
  updatePartnerPixFn,
  getPartnerRankingPositionFn,
} from "@/lib/partner-portal.functions";
import { brl, formatDateBR, formatPhone } from "@/lib/format";
import { translateError } from "@/lib/translate-error";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/parceiro/")({
  head: () => ({ meta: [{ title: "Painel do Parceiro — AJP INDICA" }] }),
  component: PartnerDashboardPage,
});

function PartnerDashboardPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const getStats = useServerFn(getPartnerDashboardStatsFn);
  const updatePix = useServerFn(updatePartnerPixFn);
  const getRankPos = useServerFn(getPartnerRankingPositionFn);

  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerCode, setPartnerCode] = useState<string>("");
  const [partnerName, setPartnerName] = useState<string>("");

  useEffect(() => {
    const id = localStorage.getItem("ajp_partner_id");
    const code = localStorage.getItem("ajp_partner_code") || "";
    const name = localStorage.getItem("ajp_partner_name") || "";
    if (!id) {
      navigate({ to: "/parceiro/login" });
      return;
    }
    setPartnerId(id);
    setPartnerCode(code);
    setPartnerName(name);
  }, [navigate]);

  const { data: stats, isLoading } = useQuery({
    queryKey: ["partner-dashboard", partnerId],
    enabled: !!partnerId,
    queryFn: () => getStats({ data: { partnerId: partnerId! } }),
  });

  const { data: rankData } = useQuery({
    queryKey: ["partner-rank", partnerId],
    enabled: !!partnerId,
    queryFn: () => getRankPos({ data: { partnerId: partnerId! } }),
  });

  // State de Edição de Pix
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState("cpf");
  const [pixLoaded, setPixLoaded] = useState(false);

  if (stats?.partner && !pixLoaded) {
    setPixKey(stats.partner.pix_key || "");
    setPixKeyType(stats.partner.pix_key_type || "cpf");
    setPixLoaded(true);
  }

  const pixMutation = useMutation({
    mutationFn: async () => {
      if (!partnerId) return;
      return await updatePix({
        data: {
          partnerId,
          pixKey,
          pixKeyType,
        },
      });
    },
    onSuccess: () => {
      toast.success("Dados Pix salvos com sucesso!");
      qc.invalidateQueries({ queryKey: ["partner-dashboard"] });
    },
    onError: (e: Error) => toast.error(translateError(e)),
  });

  const handleLogout = () => {
    localStorage.removeItem("ajp_partner_id");
    localStorage.removeItem("ajp_partner_code");
    localStorage.removeItem("ajp_partner_name");
    localStorage.removeItem("ajp_partner_email");
    navigate({ to: "/parceiro/login" });
  };

  const code = stats?.partner?.code || partnerCode || "AJP0001";
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://ajpvip.com.br";
  const refLink = `${baseUrl}/portal?ref=${code}`;

  const copyRefLink = () => {
    navigator.clipboard.writeText(refLink);
    toast.success("Link exclusivo copiado para a área de transferência!");
  };

  const shareWhatsapp = () => {
    const text = `🚀 Conheça o AJP VIP! O melhor em entretenimento, canais, filmes e séries em alta qualidade. Acesse pelo meu link com ativação imediata:\n\n👉 ${refLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  if (!partnerId || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-400">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-[#FF5500]" />
          <p className="text-sm">Carregando seu painel de parceiro...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Top Header */}
      <header className="h-16 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-30 px-4 md:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-[#FF5500] flex items-center justify-center text-white font-bold shadow-md shadow-orange-500/20">
            <Gift className="size-5" />
          </div>
          <div>
            <div className="font-bold text-sm text-zinc-100 flex items-center gap-2">
              AJP INDICA
              <Badge variant="outline" className="border-orange-500/30 text-orange-400 bg-orange-500/10 font-mono text-xs">
                {code}
              </Badge>
            </div>
            <div className="text-xs text-zinc-400">Portal do Parceiro • {stats?.partner?.name || partnerName}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 text-xs"
          >
            <LogOut className="size-3.5 mr-1.5" />
            Sair
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        {/* Banner do Link Exclusivo */}
        <div className="rounded-2xl border border-orange-500/30 bg-gradient-to-r from-orange-950/30 via-zinc-900/80 to-zinc-900/40 p-5 md:p-6 shadow-xl backdrop-blur-md">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-orange-400 block mb-1">
                Seu Link Exclusivo de Indicação
              </span>
              <h2 className="text-lg md:text-xl font-bold text-zinc-100">
                Ganhe R$ 20,00 a cada novo cliente que assinar pelo seu link
              </h2>
              <p className="text-xs text-zinc-400 mt-1 max-w-xl">
                Envie o link para amigos, clientes e redes sociais. Quando eles efetuarem a 1ª assinatura via Mercado Pago, sua comissão cai automaticamente na carteira!
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch gap-2 w-full md:w-auto">
              <Button
                onClick={copyRefLink}
                className="bg-[#FF5500] hover:bg-[#E04B00] text-white font-bold text-xs md:text-sm shadow-md shadow-orange-500/20"
              >
                <Copy className="size-4 mr-2" />
                Copiar Meu Link
              </Button>
              <Button
                onClick={shareWhatsapp}
                variant="outline"
                className="border-emerald-600/40 text-emerald-400 hover:bg-emerald-950/40 text-xs md:text-sm font-semibold"
              >
                <Share2 className="size-4 mr-2" />
                WhatsApp
              </Button>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400 font-mono bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800">
            <span className="truncate select-all">{refLink}</span>
          </div>
        </div>

        {/* KPIs Pessoais do Parceiro */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md p-4">
            <div className="text-xs text-zinc-400 font-medium">Saldo Disponível</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">{brl(stats?.balanceCents ?? 0)}</div>
            <div className="text-[11px] text-zinc-500 mt-1">Disponível para repasse Pix</div>
          </Card>

          <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md p-4">
            <div className="text-xs text-zinc-400 font-medium">Total Ganho Acumulado</div>
            <div className="text-2xl font-bold text-zinc-100 mt-1">{brl(stats?.totalEarnedCents ?? 0)}</div>
            <div className="text-[11px] text-zinc-500 mt-1">{stats?.totalCommissionsCount ?? 0} comissões geradas</div>
          </Card>

          <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md p-4">
            <div className="text-xs text-zinc-400 font-medium">Clientes Indicados Ativos</div>
            <div className="text-2xl font-bold text-sky-400 mt-1">{stats?.activeClients ?? 0}</div>
            <div className="text-[11px] text-zinc-500 mt-1">De {stats?.totalClients ?? 0} indicados totais</div>
          </Card>

          <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md p-4">
            <div className="text-xs text-zinc-400 font-medium">Próximo Fechamento Pix</div>
            <div className="text-2xl font-bold text-orange-400 mt-1">
              {stats?.nextPaymentDueDate ? formatDateBR(stats.nextPaymentDueDate) : "—"}
            </div>
            <div className="text-[11px] text-zinc-500 mt-1">{stats?.currentCycleLabel?.split(":")[0] || "Ciclo atual"}</div>
          </Card>
        </div>

        {/* Tabs de Funcionalidades */}
        <Tabs defaultValue="indicacoes" className="space-y-4">
          <TabsList className="bg-zinc-900 border border-zinc-800 p-1 flex items-center gap-1 overflow-x-auto w-full justify-start scrollbar-none">
            <TabsTrigger value="indicacoes" className="text-xs data-[state=active]:bg-[#FF5500] data-[state=active]:text-white">
              <Users className="size-3.5 mr-1.5" />
              Suas Indicações
            </TabsTrigger>
            <TabsTrigger value="comissoes" className="text-xs data-[state=active]:bg-[#FF5500] data-[state=active]:text-white">
              <DollarSign className="size-3.5 mr-1.5" />
              Suas Comissões
            </TabsTrigger>
            <TabsTrigger value="pagamentos" className="text-xs data-[state=active]:bg-[#FF5500] data-[state=active]:text-white">
              <CalendarRange className="size-3.5 mr-1.5" />
              Fechamentos &amp; Pagamentos
            </TabsTrigger>
            <TabsTrigger value="ranking" className="text-xs data-[state=active]:bg-[#FF5500] data-[state=active]:text-white">
              <Trophy className="size-3.5 mr-1.5" />
              Seu Ranking
            </TabsTrigger>
            <TabsTrigger value="pix" className="text-xs data-[state=active]:bg-[#FF5500] data-[state=active]:text-white">
              <QrCode className="size-3.5 mr-1.5" />
              Seus Dados Pix
            </TabsTrigger>
          </TabsList>

          {/* 1. SUAS INDICAÇÕES */}
          <TabsContent value="indicacoes">
            <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-zinc-100">Clientes que Utilizaram seu Link</CardTitle>
                <CardDescription className="text-xs text-zinc-400">
                  Acompanhe seus clientes indicados e seus respectivos status de acesso.
                </CardDescription>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800/80 hover:bg-transparent">
                    <TableHead className="text-zinc-400">Nome do Cliente</TableHead>
                    <TableHead className="text-zinc-400">Data de Cadastro</TableHead>
                    <TableHead className="text-zinc-400">Vencimento</TableHead>
                    <TableHead className="text-zinc-400 text-center">Status do Acesso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats?.clients?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-zinc-500">
                        Você ainda não possui clientes indicados. Comece a divulgar seu link exclusivo!
                      </TableCell>
                    </TableRow>
                  ) : (
                    stats?.clients?.map((c: any) => (
                      <TableRow key={c.id} className="border-zinc-800/60 hover:bg-zinc-800/30">
                        <TableCell className="font-medium text-zinc-100">
                          {c.name}
                        </TableCell>
                        <TableCell className="text-xs text-zinc-400">
                          {new Date(c.created_at).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-sm text-zinc-300">
                          {formatDateBR(c.due_date)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={
                              c.status === "ativo"
                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                            }
                          >
                            {c.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* 2. SUAS COMISSÕES */}
          <TabsContent value="comissoes">
            <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-zinc-100">Extrato de Comissões de R$ 20,00</CardTitle>
                <CardDescription className="text-xs text-zinc-400">
                  Comissões creditadas na confirmação da 1ª assinatura dos seus indicados.
                </CardDescription>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800/80 hover:bg-transparent">
                    <TableHead className="text-zinc-400">Data de Aprovação</TableHead>
                    <TableHead className="text-zinc-400">Descrição</TableHead>
                    <TableHead className="text-zinc-400 text-right">Valor</TableHead>
                    <TableHead className="text-zinc-400 text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats?.commissions?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-zinc-500">
                        Nenhuma comissão gerada ainda. As comissões de R$ 20,00 aparecerão aqui quando o primeiro pagamento do cliente for aprovado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    stats?.commissions?.map((cm: any) => (
                      <TableRow key={cm.id} className="border-zinc-800/60 hover:bg-zinc-800/30">
                        <TableCell className="text-xs text-zinc-300">
                          {new Date(cm.created_at).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-sm text-zinc-200">
                          Comissão 1ª Assinatura
                        </TableCell>
                        <TableCell className="text-right font-bold text-emerald-400">
                          {brl(cm.amount_cents)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={
                              cm.status === "paga"
                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                : "bg-sky-500/15 text-sky-400 border-sky-500/30"
                            }
                          >
                            {cm.status === "paga" ? "Pago via Pix" : "Aprovada na Carteira"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* 3. FECHAMENTOS E PAGAMENTOS */}
          <TabsContent value="pagamentos">
            <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-zinc-100">Lotes de Fechamento e Comprovantes Pix</CardTitle>
                <CardDescription className="text-xs text-zinc-400">
                  Repasses semanais apurados conforme o calendário oficial do programa.
                </CardDescription>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800/80 hover:bg-transparent">
                    <TableHead className="text-zinc-400">Ciclo / Período</TableHead>
                    <TableHead className="text-zinc-400">Data Prevista</TableHead>
                    <TableHead className="text-zinc-400 text-center">Qtd. Comissões</TableHead>
                    <TableHead className="text-zinc-400 text-right">Valor Repasse</TableHead>
                    <TableHead className="text-zinc-400 text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats?.closings?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-zinc-500">
                        Nenhum fechamento registrado ainda. Os repasses são processados semanalmente.
                      </TableCell>
                    </TableRow>
                  ) : (
                    stats?.closings?.map((cl: any) => (
                      <TableRow key={cl.id} className="border-zinc-800/60 hover:bg-zinc-800/30">
                        <TableCell>
                          <div className="font-semibold text-zinc-200">Ciclo {cl.cycle_number}</div>
                          <div className="text-xs text-zinc-400">{formatDateBR(cl.period_start)} até {formatDateBR(cl.period_end)}</div>
                        </TableCell>
                        <TableCell className="text-sm text-zinc-300">
                          {formatDateBR(cl.payment_due_date)}
                        </TableCell>
                        <TableCell className="text-center font-bold text-zinc-300">
                          {cl.commissions_count}
                        </TableCell>
                        <TableCell className="text-right font-bold text-lg text-emerald-400">
                          {brl(cl.total_cents)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={
                              cl.status === "pago"
                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                            }
                          >
                            {cl.status === "pago" ? "Pago via Pix" : "Em Processamento"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* 4. SEU RANKING */}
          <TabsContent value="ranking">
            <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md p-6 text-center space-y-4">
              <div className="size-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
                <Trophy className="size-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-zinc-100">Sua Posição no Ranking de Parceiros</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Classificação baseada em volume de comissões geradas no programa AJP INDICA.
                </p>
              </div>

              <div className="py-4">
                <span className="text-4xl md:text-5xl font-black text-amber-400 font-mono">
                  {rankData?.position ?? 1}º Lugar
                </span>
                <p className="text-xs text-zinc-500 mt-2">
                  Entre {rankData?.totalPartners ?? 1} indicadores ativos na rede.
                </p>
              </div>

              <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800 max-w-sm mx-auto text-xs text-zinc-300">
                Continue divulgando seu link para subir de nível e aumentar seus ganhos semanais!
              </div>
            </Card>
          </TabsContent>

          {/* 5. SEUS DADOS PIX */}
          <TabsContent value="pix">
            <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md max-w-md">
              <CardHeader>
                <CardTitle className="text-sm text-zinc-100">Chave Pix para Recebimento de Repasses</CardTitle>
                <CardDescription className="text-xs text-zinc-400">
                  Os pagamentos das comissões semanais são transferidos diretamente para esta chave Pix.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-300">Tipo de Chave Pix</Label>
                  <Select value={pixKeyType} onValueChange={setPixKeyType}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                      <SelectItem value="cpf">CPF</SelectItem>
                      <SelectItem value="cnpj">CNPJ</SelectItem>
                      <SelectItem value="telefone">Telefone Celular</SelectItem>
                      <SelectItem value="email">E-mail</SelectItem>
                      <SelectItem value="aleatoria">Chave Aleatória (EVP)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-300">Chave Pix</Label>
                  <Input
                    value={pixKey}
                    onChange={(e) => setPixKey(e.target.value)}
                    placeholder="Digite sua chave Pix..."
                    className="bg-zinc-950 border-zinc-800 font-mono text-sm"
                  />
                </div>

                <Button
                  onClick={() => pixMutation.mutate()}
                  disabled={pixMutation.isPending || !pixKey.trim()}
                  className="bg-[#FF5500] hover:bg-[#E04B00] text-white font-bold w-full"
                >
                  {pixMutation.isPending ? "Salvando..." : "Atualizar Chave Pix"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
