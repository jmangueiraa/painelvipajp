import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, Users, PieChart, TrendingUp, Filter, Download, 
  MessageSquare, BrainCircuit, Star, AlertCircle, ChevronRight
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getLeadsStats, askIA } from "./leads.functions";
import { useState } from "react";
import { KpiCard } from "@/components/kpi-card";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/_authenticated/leads")({
  component: LeadsPage,
});

function LeadsPage() {
  const [search, setSearch] = useState("");
  const [iaQuery, setIaQuery] = useState("");
  const [iaResponse, setIaResponse] = useState<string | null>(null);

  const getStatsFn = useServerFn(getLeadsStats);
  const askIAFn = useServerFn(askIA);

  const { data: stats, isLoading } = useQuery({
    queryKey: ["leads-stats"],
    queryFn: () => getStatsFn(),
  });

  const iaMutation = useMutation({
    mutationFn: (query: string) => askIAFn({ data: { query } as any }),
    onSuccess: (res: any) => {
      setIaResponse(res.answer);
    },
    onError: () => {
      toast.error("Erro ao consultar a IA");
    }
  });

  const filteredLeads = stats?.leads?.filter((lead: any) => 
    lead.name?.toLowerCase().includes(search.toLowerCase()) ||
    lead.platform?.toLowerCase().includes(search.toLowerCase()) ||
    lead.keyword?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const handleAskIA = (e: React.FormEvent) => {
    e.preventDefault();
    if (!iaQuery.trim()) return;
    iaMutation.mutate(iaQuery);
  };

  return (
    <>
      <div className="flex flex-col gap-6 p-6 pb-20">
        <PageHeader 
          title="Leads Intelligence Hub" 
          description="Qualificação avançada e gestão de leads públicos com IA"
        />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <KpiCard
            label="Total de Leads"
            value={stats?.total || 0}
            icon={Users}
            color="neutral"
          />
          <KpiCard
            label="Lead Score Médio"
            value={stats?.avgScore || 0}
            icon={Star}
            color="amber"
          />
          <KpiCard
            label="Alta Conversão"
            value={stats?.leads?.filter((l: any) => (l.lead_score || 0) > 80).length || 0}
            icon={TrendingUp}
            color="emerald"
          />
          <KpiCard
            label="Aguardando Contato"
            value={stats?.leads?.filter((l: any) => l.status === 'Novo').length || 0}
            icon={AlertCircle}
            color="rose"
          />
          <KpiCard
            label="Estágio: Decisão"
            value={stats?.leads?.filter((l: any) => l.funnel_stage === 'decisao').length || 0}
            icon={ChevronRight}
            color="sky"
          />
        </div>

        <Tabs defaultValue="list" className="w-full">
          <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
            <TabsTrigger value="list" className="flex items-center gap-2">
              <Filter className="size-4" /> CRM / Leads
            </TabsTrigger>
            <TabsTrigger value="ai" className="flex items-center gap-2">
              <BrainCircuit className="size-4" /> Assistente IA
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-6 space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div>
                  <CardTitle>Pipeline de Qualificação</CardTitle>
                  <CardDescription>Analise intenção e gerencie contatos</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Filtrar leads..."
                      className="pl-8 w-[250px]"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <Button variant="outline" size="sm" className="hidden sm:flex items-center gap-2">
                    <Download className="h-4 w-4" /> Exportar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-zinc-800/80 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead / Score</TableHead>
                        <TableHead>Plataforma</TableHead>
                        <TableHead>Intenção / Funil</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Tópicos IA</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-zinc-500">Analisando leads com IA...</TableCell></TableRow>
                      ) : filteredLeads.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-zinc-500">Nenhum lead qualificado encontrado.</TableCell></TableRow>
                      ) : (
                        filteredLeads.map((lead: any) => (
                          <TableRow key={lead.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className={`size-9 rounded-full flex items-center justify-center font-semibold text-xs border ${
                                  (lead.lead_score || 0) > 70 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                  (lead.lead_score || 0) > 40 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                  'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                }`}>
                                  {lead.lead_score || 0}
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="font-medium text-zinc-100 truncate">{lead.name || 'Público'}</span>
                                  <a href={lead.profile_link} target="_blank" rel="noopener noreferrer" className="text-[10px] text-sky-400 hover:underline truncate uppercase tracking-wider font-medium">
                                    Acessar Perfil
                                  </a>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="neutral" className="text-[10px] uppercase tracking-wider">{lead.platform}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1.5">
                                <span className="text-xs font-medium capitalize text-zinc-200">{lead.funnel_stage || 'Descoberta'}</span>
                                <div className="w-full bg-zinc-800 rounded-full h-1">
                                  <div 
                                    className="bg-zinc-300 h-1 rounded-full" 
                                    style={{ width: `${(lead.conversion_probability || 0.2) * 100}%` }}
                                  />
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                               <Badge variant={lead.status === 'Convertido' ? 'emerald' : 'neutral'} className="text-[10px]">
                                {lead.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[150px]">
                              <div className="flex flex-wrap gap-1">
                                {lead.topics?.slice(0, 2).map((t: string, i: number) => (
                                  <span key={i} className="text-[10px] px-1.5 py-0.5 bg-zinc-800 border border-zinc-700/60 rounded text-zinc-300">{t}</span>
                                )) || <span className="text-[10px] text-zinc-500 italic">Analisando...</span>}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-100">
                                <MessageSquare className="size-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ai" className="mt-6">
            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BrainCircuit className="size-5 text-zinc-400" /> 
                    Chat com IA de Vendas
                  </CardTitle>
                  <CardDescription>
                    Faça perguntas sobre a base de leads e receba insights instantâneos.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="min-h-[300px] border border-zinc-800 rounded-lg bg-zinc-950/40 p-4 relative overflow-y-auto">
                    {!iaResponse && !iaMutation.isPending && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-zinc-500">
                        <MessageSquare className="size-8 mb-2 opacity-30" />
                        <p className="text-sm">Olá! Pergunte-me sobre os leads mais promissores ou estatísticas de conversão.</p>
                      </div>
                    )}
                    
                    {iaMutation.isPending && (
                      <div className="flex items-center gap-2 text-sm text-zinc-400 animate-pulse">
                        <BrainCircuit className="size-4 animate-spin text-zinc-400" /> Processando dados...
                      </div>
                    )}

                    {iaResponse && (
                      <div className="space-y-4">
                        <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-4 text-sm text-zinc-200 whitespace-pre-wrap">
                          {iaResponse}
                        </div>
                      </div>
                    )}
                  </div>

                  <form onSubmit={handleAskIA} className="flex gap-2">
                    <Input 
                      placeholder="Ex: Quais são os leads com maior chance de conversão?" 
                      value={iaQuery}
                      onChange={(e) => setIaQuery(e.target.value)}
                    />
                    <Button type="submit" disabled={iaMutation.isPending} className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium">
                      Perguntar
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="size-4 text-zinc-400" /> Insights Sugeridos
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <button 
                    onClick={() => { setIaQuery("Quais são os 20 leads com maior chance de conversão?"); iaMutation.mutate("Quais são os 20 leads com maior chance de conversão?"); }}
                    className="w-full text-left text-xs p-2.5 hover:bg-zinc-800/60 rounded-lg border border-zinc-800 text-zinc-300 transition-colors"
                  >
                    Top 20 leads promissores
                  </button>
                  <button 
                    onClick={() => { setIaQuery("Quais contatos ainda não receberam uma abordagem?"); iaMutation.mutate("Quais contatos ainda não receberam uma abordagem?"); }}
                    className="w-full text-left text-xs p-2.5 hover:bg-zinc-800/60 rounded-lg border border-zinc-800 text-zinc-300 transition-colors"
                  >
                    Leads sem abordagem inicial
                  </button>
                  <button 
                    onClick={() => { setIaQuery("Quantos leads novos esta semana?"); iaMutation.mutate("Quantos leads novos esta semana?"); }}
                    className="w-full text-left text-xs p-2.5 hover:bg-zinc-800/60 rounded-lg border border-zinc-800 text-zinc-300 transition-colors"
                  >
                    Resumo de novos leads da semana
                  </button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
