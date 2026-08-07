import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Users, PieChart, TrendingUp, Filter, Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getLeadsStats } from "./leads.functions";
import { useState } from "react";
import { KpiCard } from "@/components/kpi-card";

export const Route = createFileRoute("/_authenticated/leads")({
  component: LeadsPage,
});

function LeadsPage() {
  const [search, setSearch] = useState("");
  const { data: stats, isLoading } = useQuery({
    queryKey: ["leads-stats"],
    queryFn: () => getLeadsStats(),
  });

  const filteredLeads = stats?.leads?.filter((lead: any) => 
    lead.name?.toLowerCase().includes(search.toLowerCase()) ||
    lead.platform?.toLowerCase().includes(search.toLowerCase()) ||
    lead.keyword?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <AppShell>
      <div className="flex flex-col gap-6 p-6">
        <PageHeader 
          title="Captura de Leads IA" 
          description="Monitore e gerencie leads interessados em IPTV capturados por IA"
        />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Total de Leads"
            value={stats?.total || 0}
            icon={Users}
            color="violet"
          />
          <KpiCard
            label="Interesse Alto"
            value={stats?.leads?.filter((l: any) => l.interest_level === 'Alto').length || 0}
            icon={TrendingUp}
            color="emerald"
          />
          <KpiCard
            label="Convertidos"
            value={stats?.leads?.filter((l: any) => l.status === 'Convertido').length || 0}
            icon={PieChart}
            color="cyan"
          />
          <KpiCard
            label="Plataformas"
            value={Object.keys(stats?.byPlatform || {}).length || 0}
            icon={Filter}
            color="amber"
          />
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle>Gerenciamento de Leads</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar leads..."
                  className="pl-8 w-[250px]"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" size="icon">
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Plataforma</TableHead>
                    <TableHead>Palavra-chave</TableHead>
                    <TableHead>Nível de Interesse</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>IA Summary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center">Carregando...</TableCell></TableRow>
                  ) : filteredLeads.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center">Nenhum lead encontrado.</TableCell></TableRow>
                  ) : (
                    filteredLeads.map((lead: any) => (
                      <TableRow key={lead.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{lead.name || 'Anônimo'}</span>
                            <a href={lead.profile_link} target="_blank" className="text-xs text-blue-500 hover:underline">Ver Perfil</a>
                          </div>
                        </TableCell>
                        <TableCell className="capitalize">{lead.platform}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{lead.keyword}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={lead.interest_level === 'Alto' ? 'default' : 'secondary'}>
                            {lead.interest_level}
                          </Badge>
                        </TableCell>
                        <TableCell>
                           <Badge variant={lead.status === 'Convertido' ? 'default' : 'outline'}>
                            {lead.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                          {lead.ai_summary}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
