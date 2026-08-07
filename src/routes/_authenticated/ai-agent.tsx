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
  MessageSquare, BrainCircuit, Smartphone, Laptop, Tv, 
  Settings, History, Plus, Trash2, Save, ExternalLink
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAgentKnowledge, getConversations, processAgentMessage } from "./ai-agent.functions";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { formatDateTimeBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/ai-agent")({
  component: AIAgentPage,
});

function AIAgentPage() {
  const [activeTab, setActiveTab] = useState("chat");
  const [chatInput, setChatInput] = useState("");
  const [sessionId] = useState(() => `session-${Math.random().toString(36).slice(2)}`);
  const [history, setHistory] = useState<any[]>([]);

  const getKnowledgeFn = useServerFn(getAgentKnowledge);
  const getConversationsFn = useServerFn(getConversations);
  const processMessageFn = useServerFn(processAgentMessage);
  const qc = useQueryClient();

  const { data: knowledge, isLoading: loadingKnowledge } = useQuery({
    queryKey: ["agent-knowledge"],
    queryFn: () => getKnowledgeFn(),
  });

  const { data: conversations, isLoading: loadingConvs } = useQuery({
    queryKey: ["agent-conversations"],
    queryFn: () => getConversationsFn(),
  });

  const chatMutation = useMutation({
    mutationFn: (message: string) => processMessageFn({ data: { sessionId, message, history } as any }),
    onSuccess: (res: any) => {
      setHistory(res.history);
      setChatInput("");
      qc.invalidateQueries({ queryKey: ["agent-conversations"] });
    },
    onError: () => toast.error("Erro ao falar com o agente")
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatMutation.isPending) return;
    chatMutation.mutate(chatInput);
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-6 p-6 pb-20">
        <PageHeader 
          title="Agente de Suporte IA" 
          description="Atendimento automático e orientação de instalação 24/7"
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 lg:w-[600px]">
            <TabsTrigger value="chat" className="flex items-center gap-2">
              <MessageSquare className="size-4" /> Simulador de Atendimento
            </TabsTrigger>
            <TabsTrigger value="crm" className="flex items-center gap-2">
              <History className="size-4" /> Histórico de Conversas
            </TabsTrigger>
            <TabsTrigger value="admin" className="flex items-center gap-2">
              <Settings className="size-4" /> Configurar Agente
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="mt-6">
            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2 flex flex-col h-[600px]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BrainCircuit className="size-5 text-primary" /> 
                    Chat com Vendedor Experiente (IA)
                  </CardTitle>
                  <CardDescription>
                    Teste o comportamento do agente simulando uma conversa de cliente.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
                  <div className="flex-1 border rounded-lg bg-muted/30 p-4 overflow-y-auto space-y-4">
                    {history.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground opacity-50">
                        <Smartphone className="size-12 mb-4" />
                        <p>Diga "Olá" para iniciar o atendimento.</p>
                      </div>
                    )}
                    {history.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-3 rounded-lg text-sm ${
                          msg.role === 'user' 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted border border-border'
                        }`}>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    ))}
                    {chatMutation.isPending && (
                      <div className="flex justify-start">
                        <div className="bg-muted border border-border p-3 rounded-lg animate-pulse text-xs italic">
                          Digitando...
                        </div>
                      </div>
                    )}
                  </div>

                  <form onSubmit={handleSend} className="flex gap-2">
                    <Input 
                      placeholder="Digite sua mensagem aqui..." 
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      disabled={chatMutation.isPending}
                    />
                    <Button type="submit" disabled={chatMutation.isPending}>
                      Enviar
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Tv className="size-4" /> Dispositivos
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {knowledge?.devices?.map((d: any) => (
                      <div key={d.id} className="flex items-center justify-between text-xs p-2 bg-muted/50 rounded border">
                        <span>{d.name}</span>
                        <Badge variant="outline" className="text-[9px]">{d.category}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Smartphone className="size-4" /> Apps Compatíveis
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {knowledge?.apps?.map((a: any) => (
                      <div key={a.id} className="flex flex-col gap-1 p-2 bg-muted/50 rounded border text-xs">
                        <div className="flex justify-between font-medium">
                          <span>{a.app_name}</span>
                          <span className="text-[9px] text-muted-foreground">{a.device_category}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">{a.description}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="crm" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Histórico de Atendimentos</CardTitle>
                <CardDescription>Conversas registradas no CRM para acompanhamento</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data / Hora</TableHead>
                        <TableHead>Cliente / Sessão</TableHead>
                        <TableHead>Última Mensagem</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingConvs ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-8">Carregando histórico...</TableCell></TableRow>
                      ) : conversations?.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-8">Nenhuma conversa registrada ainda.</TableCell></TableRow>
                      ) : (
                        conversations.map((conv: any) => (
                          <TableRow key={conv.id}>
                            <TableCell className="text-xs whitespace-nowrap">
                              {formatDateTimeBR(conv.updated_at)}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium text-xs">{conv.clients?.name || 'Visitante Anônimo'}</span>
                                <span className="text-[10px] text-muted-foreground font-mono">{conv.session_id.slice(-8)}</span>
                              </div>
                            </TableCell>
                            <TableCell className="max-w-[300px]">
                              <p className="text-xs truncate italic">
                                "{conv.messages?.[conv.messages.length - 1]?.content}"
                              </p>
                            </TableCell>
                            <TableCell>
                              <Badge variant={conv.status === 'concluido' ? 'default' : 'outline'} className="text-[10px] capitalize">
                                {conv.status.replace('_', ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <ExternalLink className="size-4" />
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

          <TabsContent value="admin" className="mt-6 space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Dispositivos & Marcas</CardTitle>
                  <CardDescription>Gerencie quais aparelhos a IA reconhece</CardDescription>
                </CardHeader>
                <CardContent>
                   <Button variant="outline" className="w-full border-dashed">
                    <Plus className="size-4 mr-2" /> Adicionar Dispositivo
                   </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Base de Tutoriais</CardTitle>
                  <CardDescription>Passo a passo de instalação por app</CardDescription>
                </CardHeader>
                <CardContent>
                   <Button variant="outline" className="w-full border-dashed">
                    <Plus className="size-4 mr-2" /> Novo Tutorial
                   </Button>
                </CardContent>
              </Card>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle>Perguntas Frequentes (IA FAQ)</CardTitle>
                <CardDescription>Respostas rápidas para dúvidas comuns configuráveis</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pergunta</TableHead>
                      <TableHead>Keywords</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {knowledge?.faq?.map((f: any) => (
                      <TableRow key={f.id}>
                        <TableCell className="text-xs">{f.question}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {f.keywords?.map((k: string) => <Badge key={k} variant="secondary" className="text-[8px]">{k}</Badge>)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0"><Trash2 className="size-3 text-destructive" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}