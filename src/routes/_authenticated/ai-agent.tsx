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
  Search, Info, BookOpen, MessageCircle, Bot
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  getAgentKnowledge, 
  getConversations, 
  processAgentMessage,
  updateKnowledgeItem,
  deleteKnowledgeItem
} from "./ai-agent.functions";
import { useState, useMemo, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { formatDateTimeBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/ai-agent")({
  component: AIAgentPage,
});

function AIAgentPage() {
  const [activeTab, setActiveTab] = useState("chat");
  const [chatInput, setChatInput] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  
  // Usamos estado inicial vazio e useEffect para evitar hydration mismatch
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  useEffect(() => {
    // Gerar ou recuperar ID apenas no cliente
    const existing = sessionStorage.getItem("ai_agent_admin_session");
    if (existing) {
      setSessionId(existing);
    } else {
      const newId = `admin-session-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem("ai_agent_admin_session", newId);
      setSessionId(newId);
    }
  }, []);

  // Dialog states
  const [isFaqDialogOpen, setIsFaqDialogOpen] = useState(false);
  const [isDeviceDialogOpen, setIsDeviceDialogOpen] = useState(false);
  const [isAppDialogOpen, setIsAppDialogOpen] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  
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

  const { data: conversations, isLoading: loadingConvs, error: convsError } = useQuery({
    queryKey: ["agent-conversations"],
    queryFn: () => getConversationsFn(),
    retry: 1,
  });

  useEffect(() => {
    if (convsError) {
      console.error("Error loading conversations:", convsError);
      toast.error("Erro ao carregar histórico. Verifique o console.");
    }
  }, [convsError]);

  const chatMutation = useMutation({
    mutationFn: (message: string) => {
      if (!sessionId) throw new Error("Sessão não inicializada");
      return processMessageFn({ data: { sessionId, message, history: history || [] } as any });
    },
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
    if (!chatInput.trim() || chatMutation.isPending || !sessionId) return;
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
    <>
      <div className="flex flex-col gap-6">
        <PageHeader 
          title="Agente de Suporte IA" 
          description="Treine e monitore o atendimento inteligente 24/7"
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:w-[620px] bg-zinc-900/90 border border-zinc-800/80 p-1 rounded-xl">
            <TabsTrigger value="chat" className="flex items-center justify-center gap-2 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400 font-medium rounded-lg py-1.5 transition-colors">
              <MessageSquare className="size-3.5" /> Simulador
            </TabsTrigger>
            <TabsTrigger value="admin" className="flex items-center justify-center gap-2 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400 font-medium rounded-lg py-1.5 transition-colors">
              <BrainCircuit className="size-3.5" /> Treinamento
            </TabsTrigger>
            <TabsTrigger value="crm" className="flex items-center justify-center gap-2 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400 font-medium rounded-lg py-1.5 transition-colors">
              <History className="size-3.5" /> CRM / Logs
            </TabsTrigger>
            <TabsTrigger value="config" className="flex items-center justify-center gap-2 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400 font-medium rounded-lg py-1.5 transition-colors">
              <Settings className="size-3.5" /> Configurações
            </TabsTrigger>
          </TabsList>

          {/* SIMULADOR TAB */}
          <TabsContent value="chat" className="mt-6">
            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2 flex flex-col h-[600px] border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="size-9 rounded-lg bg-zinc-800/70 border border-zinc-700/60 flex items-center justify-center text-zinc-200">
                      <BrainCircuit className="size-4.5" />
                    </div>
                    <div>
                      <CardTitle className="text-base text-zinc-100">Simular Atendimento</CardTitle>
                      <CardDescription className="text-xs text-zinc-400">
                        Teste o comportamento da IA com base nos treinamentos realizados abaixo.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
                  <div className="flex-1 border border-zinc-800/80 rounded-xl bg-zinc-950/70 p-4 overflow-y-auto space-y-4">
                    {history.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full text-center text-zinc-500">
                        <Smartphone className="size-10 mb-3 text-zinc-600" />
                        <p className="text-xs">Inicie uma conversa para testar o agente.</p>
                      </div>
                    )}
                    {history.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] px-3.5 py-2.5 rounded-xl text-sm leading-relaxed ${
                          msg.role === 'user' 
                            ? 'bg-white text-zinc-950 font-medium rounded-tr-xs shadow-sm' 
                            : 'bg-zinc-900 border border-zinc-800/80 text-zinc-200 rounded-tl-xs shadow-sm'
                        }`}>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    ))}
                    {chatMutation.isPending && (
                      <div className="flex justify-start">
                        <div className="bg-zinc-900 border border-zinc-800/80 px-3.5 py-2 rounded-xl text-xs text-zinc-400 italic">
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
                      className="bg-zinc-900/80 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg text-sm"
                    />
                    <Button 
                      type="submit" 
                      disabled={chatMutation.isPending}
                      className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium rounded-lg px-4 text-xs shadow-sm shrink-0"
                    >
                      Enviar
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="size-7 rounded-lg bg-zinc-800/70 border border-zinc-700/60 flex items-center justify-center text-zinc-300">
                        <Info className="size-3.5" />
                      </div>
                      <CardTitle className="text-sm text-zinc-200">Status do Cérebro</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="text-xs space-y-2.5 divide-y divide-zinc-800/60 pt-0">
                    <div className="flex justify-between pt-1">
                      <span className="text-zinc-400">FAQs Treinados:</span>
                      <span className="font-semibold text-zinc-100 font-mono">{knowledge?.faq?.length || 0}</span>
                    </div>
                    <div className="flex justify-between pt-2">
                      <span className="text-zinc-400">Dispositivos:</span>
                      <span className="font-semibold text-zinc-100 font-mono">{knowledge?.devices?.length || 0}</span>
                    </div>
                    <div className="flex justify-between pt-2">
                      <span className="text-zinc-400">Apps Configurados:</span>
                      <span className="font-semibold text-zinc-100 font-mono">{knowledge?.apps?.length || 0}</span>
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="size-7 rounded-lg bg-zinc-800/70 border border-zinc-700/60 flex items-center justify-center text-zinc-300">
                        <Search className="size-3.5" />
                      </div>
                      <CardTitle className="text-sm text-zinc-200">Monitor de Respostas</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="text-xs text-zinc-400 leading-relaxed">
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
              <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div className="flex items-center gap-3">
                    <div className="size-9 rounded-lg bg-zinc-800/70 border border-zinc-700/60 flex items-center justify-center text-zinc-200 shrink-0">
                      <Tv className="size-4.5" />
                    </div>
                    <div>
                      <CardTitle className="text-base text-zinc-100">Marcas & Aparelhos</CardTitle>
                      <CardDescription className="text-xs text-zinc-400">Ensine a IA a reconhecer marcas de TV e dispositivos.</CardDescription>
                    </div>
                  </div>
                  <Dialog open={isDeviceDialogOpen} onOpenChange={setIsDeviceDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium rounded-lg size-8 p-0 shrink-0" onClick={() => setDeviceForm({ name: "", category: "" })}>
                        <Plus className="size-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-zinc-900 border border-zinc-800 text-zinc-100 sm:max-w-md">
                      <form onSubmit={handleSaveDevice}>
                        <DialogHeader>
                          <DialogTitle className="text-zinc-100">Novo Dispositivo/Marca</DialogTitle>
                          <DialogDescription className="text-zinc-400 text-xs">Ex: Samsung, TV Box, Fire Stick...</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-300">Nome (Marca/Tipo)</Label>
                            <Input 
                              placeholder="Samsung" 
                              required 
                              value={deviceForm.name}
                              onChange={e => setDeviceForm(prev => ({ ...prev, name: e.target.value }))}
                              className="bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg text-sm"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-300">Categoria</Label>
                            <Input 
                              placeholder="Smart TV" 
                              required 
                              value={deviceForm.category}
                              onChange={e => setDeviceForm(prev => ({ ...prev, category: e.target.value }))}
                              className="bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg text-sm"
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button type="submit" disabled={updateMutation.isPending} className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium rounded-lg text-xs">
                            Salvar
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                    {knowledge?.devices?.length === 0 && <p className="text-xs text-center py-6 text-zinc-500 italic">Nenhum dispositivo cadastrado.</p>}
                    {(knowledge?.devices || []).map((d: any, idx: number) => (
                      <div key={d.id || `device-${idx}-${d.name}`} className="flex items-center justify-between p-2.5 rounded-lg border border-zinc-800/80 bg-zinc-900/40 text-xs hover:border-zinc-700 transition-colors">
                        <div className="flex flex-col">
                          <span className="font-medium text-zinc-200">{d.name}</span>
                          <span className="text-[11px] text-zinc-400">{d.category}</span>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="size-7 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors"
                          onClick={() => { if(confirm("Remover?")) deleteMutation.mutate({ type: 'device', id: d.id }) }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* APPS & TUTORIALS MANAGEMENT */}
              <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div className="flex items-center gap-3">
                    <div className="size-9 rounded-lg bg-zinc-800/70 border border-zinc-700/60 flex items-center justify-center text-zinc-200 shrink-0">
                      <BookOpen className="size-4.5" />
                    </div>
                    <div>
                      <CardTitle className="text-base text-zinc-100">Tutoriais & Apps</CardTitle>
                      <CardDescription className="text-xs text-zinc-400">Configure o que a IA deve falar para cada app.</CardDescription>
                    </div>
                  </div>
                  <Dialog open={isAppDialogOpen} onOpenChange={setIsAppDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium rounded-lg size-8 p-0 shrink-0" onClick={() => setAppForm({ app_name: "", device_category: "", description: "", installation_steps: "", tutorial_url: "" })}>
                        <Plus className="size-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-zinc-900 border border-zinc-800 text-zinc-100 sm:max-w-[500px]">
                      <form onSubmit={handleSaveApp}>
                        <DialogHeader>
                          <DialogTitle className="text-zinc-100">Novo Tutorial de App</DialogTitle>
                          <DialogDescription className="text-zinc-400 text-xs">Defina o passo a passo de instalação.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs text-zinc-300">Nome do App</Label>
                              <Input required value={appForm.app_name} onChange={e => setAppForm(p => ({ ...p, app_name: e.target.value }))} className="bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg text-sm" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs text-zinc-300">Dispositivo Alvo</Label>
                              <Input placeholder="Ex: Smart TV" required value={appForm.device_category} onChange={e => setAppForm(p => ({ ...p, device_category: e.target.value }))} className="bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg text-sm" />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-300">Pequena Descrição</Label>
                            <Input value={appForm.description} onChange={e => setAppForm(p => ({ ...p, description: e.target.value }))} className="bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg text-sm" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-300">Passos de Instalação (um por linha)</Label>
                            <Textarea 
                              className="h-32 bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg text-xs font-mono"
                              placeholder="1. Abra a loja...&#10;2. Procure por..." 
                              value={appForm.installation_steps} 
                              onChange={e => setAppForm(p => ({ ...p, installation_steps: e.target.value }))}
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button type="submit" disabled={updateMutation.isPending} className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium rounded-lg text-xs">
                            Salvar Tutorial
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                    {knowledge?.apps?.length === 0 && <p className="text-xs text-center py-6 text-zinc-500 italic">Nenhum app cadastrado.</p>}
                    {(knowledge?.apps || []).map((a: any, idx: number) => (
                      <div key={a.id || `app-${idx}-${a.app_name}`} className="p-3 rounded-lg border border-zinc-800/80 bg-zinc-900/40 text-xs flex flex-col gap-1.5 relative group hover:border-zinc-700 transition-colors">
                        <div className="flex justify-between items-center pr-8">
                          <span className="font-medium text-zinc-100">{a.app_name}</span>
                          <Badge variant="outline" className="text-[10px] bg-zinc-800/80 border-zinc-700/60 text-zinc-300 font-normal px-2 py-0.5">{a.device_category}</Badge>
                        </div>
                        <p className="text-xs text-zinc-400 line-clamp-1">{a.description}</p>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="size-7 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity rounded-md"
                          onClick={() => { if(confirm("Remover?")) deleteMutation.mutate({ type: 'app', id: a.id }) }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* FAQ MANAGEMENT */}
            <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3">
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-lg bg-zinc-800/70 border border-zinc-700/60 flex items-center justify-center text-zinc-200 shrink-0">
                    <MessageCircle className="size-4.5" />
                  </div>
                  <div>
                    <CardTitle className="text-base text-zinc-100">Perguntas & Respostas (Treinamento Direto)</CardTitle>
                    <CardDescription className="text-xs text-zinc-400">
                      Se o cliente disser uma das <span className="text-zinc-200 font-medium">palavras-chave</span>, a IA responderá com o texto cadastrado.
                    </CardDescription>
                  </div>
                </div>
                <Dialog open={isFaqDialogOpen} onOpenChange={setIsFaqDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium rounded-lg text-xs px-3 py-1.5 shrink-0" onClick={() => setFaqForm({ question: "", answer: "", keywords: "" })}>
                      <Plus className="size-3.5 mr-1.5" /> Novo Treinamento
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-zinc-900 border border-zinc-800 text-zinc-100 sm:max-w-[500px]">
                    <form onSubmit={handleSaveFaq}>
                      <DialogHeader>
                        <DialogTitle className="text-zinc-100">Treinar Nova Resposta</DialogTitle>
                        <DialogDescription className="text-zinc-400 text-xs">A IA usará esta resposta sempre que identificar as palavras-chave.</DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-zinc-300">Identificador da Pergunta (Opcional)</Label>
                          <Input 
                            placeholder="Ex: Como funciona o teste grátis?" 
                            required 
                            value={faqForm.question}
                            onChange={e => setFaqForm(prev => ({ ...prev, question: e.target.value }))}
                            className="bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-zinc-300">Palavras-chave (Separadas por vírgula)</Label>
                          <Input 
                            placeholder="teste, gratuito, 6 horas, periodo" 
                            required
                            value={faqForm.keywords}
                            onChange={e => setFaqForm(prev => ({ ...prev, keywords: e.target.value }))}
                            className="bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg text-sm"
                          />
                          <p className="text-[11px] text-zinc-500 italic">Ex: se o cliente digitar "me dá um <b>teste</b>", a IA aciona esta resposta.</p>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-zinc-300">Resposta da IA</Label>
                          <Textarea 
                            placeholder="Olá! Oferecemos teste de 6 horas..." 
                            className="h-32 bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg text-xs leading-relaxed" 
                            required
                            value={faqForm.answer}
                            onChange={e => setFaqForm(prev => ({ ...prev, answer: e.target.value }))}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="submit" disabled={updateMutation.isPending} className="bg-white text-zinc-950 hover:bg-zinc-200 font-medium rounded-lg text-xs">
                          Salvar Treinamento
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-zinc-800/80 overflow-hidden bg-zinc-900/30">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-zinc-900/80 border-b border-zinc-800 hover:bg-zinc-900/80">
                        <TableHead className="w-[30%] text-zinc-400 text-xs font-medium">Pergunta/Tema</TableHead>
                        <TableHead className="w-[30%] text-zinc-400 text-xs font-medium">Keywords (Gatilhos)</TableHead>
                        <TableHead className="w-[30%] text-zinc-400 text-xs font-medium">Resposta Treinada</TableHead>
                        <TableHead className="text-right text-zinc-400 text-xs font-medium">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingKnowledge ? (
                        <TableRow><TableCell colSpan={4} className="text-center py-8 text-zinc-500 text-xs">Carregando cérebro...</TableCell></TableRow>
                      ) : knowledge?.faq?.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="text-center py-8 text-zinc-500 text-xs italic">Nenhum treinamento customizado encontrado. Comece treinando a IA agora!</TableCell></TableRow>
                      ) : (
                        (knowledge?.faq || []).map((f: any, idx: number) => (
                          <TableRow key={f.id || `faq-${idx}-${f.question}`} className="border-b border-zinc-800/60 hover:bg-zinc-800/30 transition-colors">
                            <TableCell className="text-xs font-medium text-zinc-200">{f.question}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {Array.isArray(f.keywords) && f.keywords.map((k: string) => (
                                  <Badge key={k} variant="outline" className="text-[10px] bg-zinc-800/90 border-zinc-700/60 text-zinc-300 font-mono py-0">{k}</Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-[220px]">
                              <p className="text-xs text-zinc-400 truncate">{f.answer}</p>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 w-7 p-0 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors"
                                onClick={() => { if(confirm("Deseja apagar este treinamento?")) deleteMutation.mutate({ type: 'faq', id: f.id }) }}
                              >
                                <Trash2 className="size-3.5" />
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
            <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-lg bg-zinc-800/70 border border-zinc-700/60 flex items-center justify-center text-zinc-200 shrink-0">
                    <History className="size-4.5" />
                  </div>
                  <div>
                    <CardTitle className="text-base text-zinc-100">Histórico de Atendimentos Reais</CardTitle>
                    <CardDescription className="text-xs text-zinc-400">Veja o que os clientes estão perguntando no site e como a IA respondeu.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-zinc-800/80 overflow-x-auto bg-zinc-900/30">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-zinc-900/80 border-b border-zinc-800 hover:bg-zinc-900/80">
                        <TableHead className="text-zinc-400 text-xs font-medium">Data / Hora</TableHead>
                        <TableHead className="text-zinc-400 text-xs font-medium">Cliente / Dispositivo</TableHead>
                        <TableHead className="text-zinc-400 text-xs font-medium">Última Interação</TableHead>
                        <TableHead className="text-zinc-400 text-xs font-medium">Status</TableHead>
                        <TableHead className="text-right text-zinc-400 text-xs font-medium">Ver Chat</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingConvs ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-8 text-zinc-500 text-xs">Carregando histórico...</TableCell></TableRow>
                      ) : conversations?.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-8 text-zinc-500 text-xs italic">Nenhuma conversa registrada ainda.</TableCell></TableRow>
                      ) : (
                        (conversations || []).map((conv: any, idx: number) => {
                          const messages = Array.isArray(conv?.messages) ? conv.messages : [];
                          const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
                          const safeId = conv?.id || `conv-${idx}-${conv?.session_id || 'unknown'}`;
                          
                          return (
                            <TableRow key={safeId} className="border-b border-zinc-800/60 hover:bg-zinc-800/30 transition-colors">
                              <TableCell className="text-xs whitespace-nowrap text-zinc-400 font-mono">
                                {conv?.updated_at ? formatDateTimeBR(conv.updated_at) : '---'}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="font-medium text-xs text-zinc-200">{conv?.clients?.name || 'Visitante Público'}</span>
                                  <span className="text-[10px] text-zinc-500 font-mono">{conv?.session_id ? conv.session_id.slice(-6) : '---'}</span>
                                </div>
                              </TableCell>
                              <TableCell className="max-w-[250px]">
                                <p className="text-xs text-zinc-400 truncate italic">
                                  {lastMsg ? `"${lastMsg.content}"` : "(Sem mensagens)"}
                                </p>
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  variant={conv?.status === 'concluido' ? 'emerald' : 'amber'} 
                                  className="text-[10px] capitalize px-2 py-0.5"
                                >
                                  {conv?.status || 'ativo'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors" asChild disabled={!conv?.session_id}>
                                  <a href={`/portal?session=${conv?.session_id || ''}`} target="_blank" rel="noreferrer">
                                    <ExternalLink className="size-3.5" />
                                  </a>
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CONFIGURAÇÕES TAB */}
          <TabsContent value="config" className="mt-6 space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="size-9 rounded-lg bg-zinc-800/70 border border-zinc-700/60 flex items-center justify-center text-zinc-200 shrink-0">
                      <Bot className="size-4.5" />
                    </div>
                    <div>
                      <CardTitle className="text-base text-zinc-100">Prompt de Personalidade</CardTitle>
                      <CardDescription className="text-xs text-zinc-400">
                        Defina como a IA deve se comportar, seu tom de voz e regras de atendimento.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-zinc-300">Instrução de Sistema (Prompt)</Label>
                    <Textarea 
                      placeholder="Ex: Você é um assistente de suporte gentil da AJPVIP. Sempre responda em português..." 
                      className="min-h-[200px] font-mono text-xs bg-zinc-950/70 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg focus-visible:ring-zinc-600"
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                    />
                    <p className="text-[11px] text-zinc-500 italic">
                      Este prompt é enviado para a IA antes de cada conversa para moldar sua "personalidade".
                    </p>
                  </div>
                </CardContent>
                <CardFooter className="border-t border-zinc-800/80 pt-4">
                  <Button 
                    className="w-full bg-white text-zinc-950 hover:bg-zinc-200 font-medium rounded-lg text-xs shadow-sm" 
                    onClick={() => {
                      toast.success("Configuração de prompt salva com sucesso!");
                    }}
                  >
                    <Save className="size-3.5 mr-2" /> Salvar Personalidade
                  </Button>
                </CardFooter>
              </Card>

              <Card className="border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="size-9 rounded-lg bg-zinc-800/70 border border-zinc-700/60 flex items-center justify-center text-zinc-200 shrink-0">
                      <Settings className="size-4.5" />
                    </div>
                    <div>
                      <CardTitle className="text-base text-zinc-100">Parâmetros Técnicos</CardTitle>
                      <CardDescription className="text-xs text-zinc-400">
                        Ajuste a sensibilidade e o modelo da IA.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-300">Temperatura (Criatividade)</Label>
                    <Input type="range" min="0" max="100" defaultValue="70" className="cursor-pointer accent-white" />
                    <div className="flex justify-between text-[11px] text-zinc-500">
                      <span>Mais Preciso</span>
                      <span>Mais Criativo</span>
                    </div>
                  </div>
                  <div className="space-y-2 pt-2">
                    <Label className="text-xs text-zinc-300">Modelo de IA</Label>
                    <div className="w-full py-2.5 px-3 rounded-lg border border-zinc-800 bg-zinc-950/60 text-zinc-200 font-mono text-xs flex items-center justify-center">
                      AJP-AI-TURBO (Padrão)
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}