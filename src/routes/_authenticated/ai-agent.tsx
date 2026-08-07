import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  MessageSquare, BrainCircuit, Smartphone, Laptop, Tv, 
  Settings, History, Plus, Trash2, Save, ExternalLink, 
  Search, Info, BookOpen, MessageCircle
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  getAgentKnowledge, 
  getConversations, 
  processAgentMessage,
  updateKnowledgeItem,
  deleteKnowledgeItem
} from "./ai-agent.functions";
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { formatDateTimeBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/ai-agent")({
  component: AIAgentPage,
});

function AIAgentPage() {
  const [activeTab, setActiveTab] = useState("chat");
  const [chatInput, setChatInput] = useState("");
  const sessionId = useMemo(() => `session-${Math.random().toString(36).slice(2)}`, []);
  const [history, setHistory] = useState<any[]>([]);

  // Dialog states
  const [isFaqDialogOpen, setIsFaqDialogOpen] = useState(false);
  const [isDeviceDialogOpen, setIsDeviceDialogOpen] = useState(false);
  const [isAppDialogOpen, setIsAppDialogOpen] = useState(false);
  
  // Form states
  const [faqForm, setFaqForm] = useState({ question: "", answer: "", keywords: "" });
  const [deviceForm, setDeviceForm] = useState({ name: "", category: "" });
  const [appForm, setAppForm] = useState({ 
    app_name: "", 
    device_category: "", 
    description: "", 
    installation_steps: "", 
    tutorial_url: "" 
  });

  const getKnowledgeFn = useServerFn(getAgentKnowledge);
  const getConversationsFn = useServerFn(getConversations);
  const processMessageFn = useServerFn(processAgentMessage);
  const updateKnowledgeFn = useServerFn(updateKnowledgeItem);
  const deleteKnowledgeFn = useServerFn(deleteKnowledgeItem);
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

  const updateMutation = useMutation({
    mutationFn: ({ type, item }: { type: 'faq' | 'device' | 'app', item: any }) => 
      updateKnowledgeFn({ data: { type, item } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-knowledge"] });
      toast.success("Conhecimento atualizado com sucesso!");
      setIsFaqDialogOpen(false);
      setIsDeviceDialogOpen(false);
      setIsAppDialogOpen(false);
    },
    onError: (err) => toast.error("Erro ao salvar: " + (err as Error).message)
  });

  const deleteMutation = useMutation({
    mutationFn: ({ type, id }: { type: 'faq' | 'device' | 'app', id: string }) => 
      deleteKnowledgeFn({ data: { type, id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-knowledge"] });
      toast.success("Item removido com sucesso!");
    },
    onError: (err) => toast.error("Erro ao remover: " + (err as Error).message)
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatMutation.isPending) return;
    chatMutation.mutate(chatInput);
  };

  const handleSaveFaq = (e: React.FormEvent) => {
    e.preventDefault();
    const keywordsArray = faqForm.keywords.split(',').map(k => k.trim()).filter(k => k !== "");
    updateMutation.mutate({ 
      type: 'faq', 
      item: { ...faqForm, keywords: keywordsArray } 
    });
  };

  const handleSaveDevice = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({ type: 'device', item: deviceForm });
  };

  const handleSaveApp = (e: React.FormEvent) => {
    e.preventDefault();
    const stepsArray = appForm.installation_steps.split('\n').filter(s => s.trim() !== "");
    updateMutation.mutate({ 
      type: 'app', 
      item: { ...appForm, installation_steps: stepsArray, is_active: true } 
    });
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-6 p-6 pb-20">
        <PageHeader 
          title="Agente de Suporte IA" 
          description="Treine e monitore o atendimento inteligente 24/7"
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 lg:w-[600px]">
            <TabsTrigger value="chat" className="flex items-center gap-2">
              <MessageSquare className="size-4" /> Simulador
            </TabsTrigger>
            <TabsTrigger value="admin" className="flex items-center gap-2">
              <BrainCircuit className="size-4" /> Treinamento
            </TabsTrigger>
            <TabsTrigger value="crm" className="flex items-center gap-2">
              <History className="size-4" /> CRM / Logs
            </TabsTrigger>
          </TabsList>

          {/* SIMULADOR TAB */}
          <TabsContent value="chat" className="mt-6">
            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2 flex flex-col h-[600px]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BrainCircuit className="size-5 text-primary" /> 
                    Simular Atendimento
                  </CardTitle>
                  <CardDescription>
                    Teste o comportamento da IA com base nos treinamentos realizados abaixo.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
                  <div className="flex-1 border rounded-lg bg-muted/30 p-4 overflow-y-auto space-y-4">
                    {history.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground opacity-50">
                        <Smartphone className="size-12 mb-4" />
                        <p>Inicie uma conversa para testar o agente.</p>
                      </div>
                    )}
                    {history.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-3 rounded-lg text-sm ${
                          msg.role === 'user' 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted border border-border shadow-sm'
                        }`}>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    ))}
                    {chatMutation.isPending && (
                      <div className="flex justify-start">
                        <div className="bg-muted border border-border p-3 rounded-lg animate-pulse text-xs italic">
                          Pensando...
                        </div>
                      </div>
                    )}
                  </div>

                  <form onSubmit={handleSend} className="flex gap-2">
                    <Input 
                      placeholder="Diga 'Como instalo na Smart TV Samsung?' ou similar..." 
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
                <Card className="bg-primary/5 border-primary/20">
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Info className="size-4 text-primary" /> Status do Cérebro
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">FAQs Treinados:</span>
                      <span className="font-bold">{knowledge?.faq?.length || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Dispositivos:</span>
                      <span className="font-bold">{knowledge?.devices?.length || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Apps Configurados:</span>
                      <span className="font-bold">{knowledge?.apps?.length || 0}</span>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Search className="size-4" /> Monitor de Respostas
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground italic">
                    Use o simulador ao lado para verificar se a IA está identificando corretamente as marcas e fornecendo os tutoriais certos.
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* TREINAMENTO TAB */}
          <TabsContent value="admin" className="mt-6 space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* DEVICES MANAGEMENT */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="space-y-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Tv className="size-5 text-primary" /> Marcas & Aparelhos
                    </CardTitle>
                    <CardDescription className="text-xs">Ensine a IA a reconhecer marcas de TV e dispositivos.</CardDescription>
                  </div>
                  <Dialog open={isDeviceDialogOpen} onOpenChange={setIsDeviceDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" onClick={() => setDeviceForm({ name: "", category: "" })}>
                        <Plus className="size-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <form onSubmit={handleSaveDevice}>
                        <DialogHeader>
                          <DialogTitle>Novo Dispositivo/Marca</DialogTitle>
                          <DialogDescription>Ex: Samsung, TV Box, Fire Stick...</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="space-y-2">
                            <Label>Nome (Marca/Tipo)</Label>
                            <Input 
                              placeholder="Samsung" 
                              required 
                              value={deviceForm.name}
                              onChange={e => setDeviceForm(prev => ({ ...prev, name: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Categoria</Label>
                            <Input 
                              placeholder="Smart TV" 
                              required 
                              value={deviceForm.category}
                              onChange={e => setDeviceForm(prev => ({ ...prev, category: e.target.value }))}
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button type="submit" disabled={updateMutation.isPending}>Salvar</Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                    {knowledge?.devices?.length === 0 && <p className="text-xs text-center py-4 text-muted-foreground italic">Nenhum dispositivo cadastrado.</p>}
                    {knowledge?.devices?.map((d: any) => (
                      <div key={d.id} className="flex items-center justify-between p-2 rounded border bg-muted/50 text-xs">
                        <div className="flex flex-col">
                          <span className="font-bold">{d.name}</span>
                          <span className="text-[10px] text-muted-foreground">{d.category}</span>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="size-6 text-destructive"
                          onClick={() => { if(confirm("Remover?")) deleteMutation.mutate({ type: 'device', id: d.id }) }}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* APPS & TUTORIALS MANAGEMENT */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="space-y-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <BookOpen className="size-5 text-primary" /> Tutoriais & Apps
                    </CardTitle>
                    <CardDescription className="text-xs">Configure o que a IA deve falar para cada app.</CardDescription>
                  </div>
                  <Dialog open={isAppDialogOpen} onOpenChange={setIsAppDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" onClick={() => setAppForm({ app_name: "", device_category: "", description: "", installation_steps: "", tutorial_url: "" })}>
                        <Plus className="size-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                      <form onSubmit={handleSaveApp}>
                        <DialogHeader>
                          <DialogTitle>Novo Tutorial de App</DialogTitle>
                          <DialogDescription>Defina o passo a passo de instalação.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label>Nome do App</Label>
                              <Input required value={appForm.app_name} onChange={e => setAppForm(p => ({ ...p, app_name: e.target.value }))} />
                            </div>
                            <div className="space-y-1">
                              <Label>Dispositivo Alvo</Label>
                              <Input placeholder="Ex: Smart TV" required value={appForm.device_category} onChange={e => setAppForm(p => ({ ...p, device_category: e.target.value }))} />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label>Pequena Descrição</Label>
                            <Input value={appForm.description} onChange={e => setAppForm(p => ({ ...p, description: e.target.value }))} />
                          </div>
                          <div className="space-y-1">
                            <Label>Passos de Instalação (um por linha)</Label>
                            <Textarea 
                              className="h-32"
                              placeholder="1. Abra a loja...&#10;2. Procure por..." 
                              value={appForm.installation_steps} 
                              onChange={e => setAppForm(p => ({ ...p, installation_steps: e.target.value }))}
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button type="submit" disabled={updateMutation.isPending}>Salvar Tutorial</Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                    {knowledge?.apps?.length === 0 && <p className="text-xs text-center py-4 text-muted-foreground italic">Nenhum app cadastrado.</p>}
                    {knowledge?.apps?.map((a: any) => (
                      <div key={a.id} className="p-2 rounded border bg-muted/50 text-xs flex flex-col gap-1 relative group">
                        <div className="flex justify-between items-center pr-8">
                          <span className="font-bold text-primary">{a.app_name}</span>
                          <Badge variant="outline" className="text-[9px]">{a.device_category}</Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground line-clamp-1">{a.description}</p>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="size-6 text-destructive absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => { if(confirm("Remover?")) deleteMutation.mutate({ type: 'app', id: a.id }) }}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* FAQ MANAGEMENT */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    <MessageCircle className="size-5 text-primary" /> Perguntas & Respostas (Treinamento Direto)
                  </CardTitle>
                  <CardDescription>
                    Se o cliente disser uma das <b>keywords</b>, a IA responderá com a <b>resposta configurada</b>.
                  </CardDescription>
                </div>
                <Dialog open={isFaqDialogOpen} onOpenChange={setIsFaqDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => setFaqForm({ question: "", answer: "", keywords: "" })}>
                      <Plus className="size-4 mr-2" /> Novo Treinamento
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[500px]">
                    <form onSubmit={handleSaveFaq}>
                      <DialogHeader>
                        <DialogTitle>Treinar Nova Resposta</DialogTitle>
                        <DialogDescription>A IA usará esta resposta sempre que identificar as palavras-chave.</DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                          <Label>Identificador da Pergunta (Opcional)</Label>
                          <Input 
                            placeholder="Ex: Como funciona o teste grátis?" 
                            required 
                            value={faqForm.question}
                            onChange={e => setFaqForm(prev => ({ ...prev, question: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Palavras-chave (Separadas por vírgula)</Label>
                          <Input 
                            placeholder="teste, gratuito, 6 horas, periodo" 
                            required
                            value={faqForm.keywords}
                            onChange={e => setFaqForm(prev => ({ ...prev, keywords: e.target.value }))}
                          />
                          <p className="text-[10px] text-muted-foreground italic">Ex: se o cliente digitar "me dá um <b>teste</b>", a IA aciona esta resposta.</p>
                        </div>
                        <div className="space-y-2">
                          <Label>Resposta da IA</Label>
                          <Textarea 
                            placeholder="Olá! Oferecemos teste de 6 horas..." 
                            className="h-32" 
                            required
                            value={faqForm.answer}
                            onChange={e => setFaqForm(prev => ({ ...prev, answer: e.target.value }))}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="submit" disabled={updateMutation.isPending}>Salvar Treinamento</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-[30%]">Pergunta/Tema</TableHead>
                        <TableHead className="w-[30%]">Keywords (Gatilhos)</TableHead>
                        <TableHead className="w-[30%]">Resposta Treinada</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingKnowledge ? (
                        <TableRow><TableCell colSpan={4} className="text-center py-8">Carregando cérebro...</TableCell></TableRow>
                      ) : knowledge?.faq?.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground italic">Nenhum treinamento customizado encontrado. Comece treinando a IA agora!</TableCell></TableRow>
                      ) : (
                        knowledge?.faq?.map((f: any) => (
                          <TableRow key={f.id} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="text-xs font-medium">{f.question}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {f.keywords?.map((k: string) => (
                                  <Badge key={k} variant="secondary" className="text-[9px] bg-primary/10 text-primary border-primary/20">{k}</Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-[200px]">
                              <p className="text-[10px] text-muted-foreground truncate">{f.answer}</p>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 w-8 p-0 text-destructive"
                                onClick={() => { if(confirm("Deseja apagar este treinamento?")) deleteMutation.mutate({ type: 'faq', id: f.id }) }}
                              >
                                <Trash2 className="size-4" />
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

          {/* CRM / LOGS TAB */}
          <TabsContent value="crm" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Histórico de Atendimentos Reais</CardTitle>
                <CardDescription>Veja o que os clientes estão perguntando no site e como a IA respondeu.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Data / Hora</TableHead>
                        <TableHead>Cliente / Dispositivo</TableHead>
                        <TableHead>Última Interação</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ver Chat</TableHead>
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
                                <span className="font-medium text-xs">{conv.clients?.name || 'Visitante Público'}</span>
                                <span className="text-[9px] text-muted-foreground font-mono">{conv.session_id.slice(-6)}</span>
                              </div>
                            </TableCell>
                            <TableCell className="max-w-[250px]">
                              <p className="text-[10px] truncate italic">
                                "{conv.messages?.[conv.messages.length - 1]?.content}"
                              </p>
                            </TableCell>
                            <TableCell>
                              <Badge variant={conv.status === 'concluido' ? 'default' : 'outline'} className="text-[9px] capitalize px-1 h-5">
                                {conv.status || 'ativo'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                                <a href={`/portal?session=${conv.session_id}`} target="_blank" rel="noreferrer">
                                  <ExternalLink className="size-4" />
                                </a>
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
        </Tabs>
      </div>
    </AppShell>
  );
}