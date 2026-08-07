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
    mutationFn: (query: string) => askIAFn({ data: { query } }),
    onSuccess: (res) => {
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
    <AppShell>
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
            color="violet"
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
            color="cyan"
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
                <div className="rounded-md border overflow-x-auto">
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
                        <TableRow><TableCell colSpan={6} className="text-center py-8">Analisando leads com IA...</TableCell></TableRow>
                      ) : filteredLeads.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8">Nenhum lead qualificado encontrado.</TableCell></TableRow>
                      ) : (
                        filteredLeads.map((lead: any) => (
                          <TableRow key={lead.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className={`size-10 rounded-full flex items-center justify-center font-bold text-xs ${
                                  (lead.lead_score || 0) > 70 ? 'bg-emerald-500/10 text-emerald-500' :
                                  (lead.lead_score || 0) > 40 ? 'bg-amber-500/10 text-amber-500' :
                                  'bg-rose-500/10 text-rose-500'
                                }`}>
                                  {lead.lead_score || 0}
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="font-medium truncate">{lead.name || 'Público'}</span>
                                  <a href={lead.profile_link} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 hover:underline truncate uppercase tracking-tighter">
                                    Acessar Perfil
                                  </a>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-[10px] uppercase tracking-widest">{lead.platform}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <span className="text-xs font-medium capitalize">{lead.funnel_stage || 'Descoberta'}</span>
                                <div className="w-full bg-muted rounded-full h-1">
                                  <div 
                                    className="bg-primary h-1 rounded-full" 
                                    style={{ width: `${(lead.conversion_probability || 0.2) * 100}%` }}
                                  />
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                               <Badge variant={lead.status === 'Convertido' ? 'default' : 'outline'} className="text-[10px]">
                                {lead.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[150px]">
                              <div className="flex flex-wrap gap-1">
                                {lead.topics?.slice(0, 2).map((t: string, i: number) => (
                                  <span key={i} className="text-[9px] px-1 bg-muted rounded">{t}</span>
                                )) || <span className="text-[10px] text-muted-foreground italic">Analisando...</span>}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
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
                    <BrainCircuit className="size-5 text-primary" /> 
                    Chat com IA de Vendas
                  </CardTitle>
                  <CardDescription>
                    Faça perguntas sobre a base de leads e receba insights instantâneos.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="min-h-[300px] border rounded-lg bg-muted/30 p-4 relative overflow-y-auto">
                    {!iaResponse && !iaMutation.isPending && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
                        <MessageSquare className="size-8 mb-2 opacity-20" />
                        <p className="text-sm">Olá! Pergunte-me sobre os leads mais promissores ou estatísticas de conversão.</p>
                      </div>
                    )}
                    
                    {iaMutation.isPending && (
                      <div className="flex items-center gap-2 text-sm animate-pulse">
                        <BrainCircuit className="size-4 animate-spin" /> Processando dados...
                      </div>
                    )}

                    {iaResponse && (
                      <div className="space-y-4">
                        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-sm whitespace-pre-wrap">
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
                    <Button type="submit" disabled={iaMutation.isPending}>
                      Perguntar
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="size-4" /> Insights Sugeridos
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <button 
                    onClick={() => { setIaQuery("Quais são os 20 leads com maior chance de conversão?"); iaMutation.mutate("Quais são os 20 leads com maior chance de conversão?"); }}
                    className="w-full text-left text-xs p-2 hover:bg-muted rounded border transition-colors"
                  >
                    Top 20 leads promissores
                  </button>
                  <button 
                    onClick={() => { setIaQuery("Quais contatos ainda não receberam uma abordagem?"); iaMutation.mutate("Quais contatos ainda não receberam uma abordagem?"); }}
                    className="w-full text-left text-xs p-2 hover:bg-muted rounded border transition-colors"
                  >
                    Leads sem abordagem inicial
                  </button>
                  <button 
                    onClick={() => { setIaQuery("Quantos leads novos esta semana?"); iaMutation.mutate("Quantos leads novos esta semana?"); }}
                    className="w-full text-left text-xs p-2 hover:bg-muted rounded border transition-colors"
                  >
                    Resumo de novos leads da semana
                  </button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
