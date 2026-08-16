import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, User, Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export const AIChat = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    setSessionId(Math.random().toString(36).substring(7));
  }, []);

  useEffect(() => {
    (window as any).scrollToAIChat = () => {
      setIsOpen(true);
    };
    return () => {
      delete (window as any).scrollToAIChat;
    };
  }, []);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        role: "assistant",
        content: "Olá! Sou seu assistente de instalação AJP. Para começarmos, qual seu nome e em qual dispositivo você pretende usar nosso serviço?"
      }]);
    }
  }, [isOpen, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    const historyForApi = messages.map((m) => ({ role: m.role, content: m.content }));
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/public/portal/public-ai-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId || "anonymous",
          message: userMsg,
          history: historyForApi
        })
      });

      const data = await response.json().catch(() => null);

      if (response.ok && data?.response) {
        setMessages(prev => [...prev, { role: "assistant", content: data.response }]);

        // Check if user wants to hire/whatsapp
        if (userMsg.toLowerCase().includes("contratar") || userMsg.toLowerCase().includes("assinar")) {
          setTimeout(() => {
            window.open("https://wa.me/5519981356505?text=Olá, vim do chat da IA e gostaria de contratar um plano.", "_blank");
          }, 1500);
        }
      } else {
        console.error("AI agent error:", data);
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `Tive uma instabilidade para responder agora (Erro: ${data?.error || 'Unknown'}). Pode tentar novamente? Se preferir atendimento imediato, chame no WhatsApp (19) 98135-6505.`
        }]);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Não consegui me conectar agora. Verifique sua internet e tente novamente, ou fale no WhatsApp (19) 98135-6505."
      }]);
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setIsOpen(true)}
            className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-full flex items-center justify-center shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 group"
          >
            <MessageCircle className="w-8 h-8 text-white group-hover:scale-110 transition-transform" />
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-green-500"></span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.9 }}
            className="w-[90vw] sm:w-[400px] h-[600px] max-h-[80vh] flex flex-col"
          >
            <Card className="flex-1 border-white/10 bg-slate-900/90 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-blue-600/20 to-indigo-600/20 border-b border-white/5 p-4 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
                    <Bot className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-bold text-white">Suporte Inteligente AJP</CardTitle>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Online agora</span>
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </Button>
              </CardHeader>

              <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
                <div className="space-y-4">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex gap-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${msg.role === 'user' ? 'bg-indigo-600' : 'bg-slate-800 border border-white/10'}`}>
                          {msg.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
                        </div>
                        <div className={`rounded-2xl px-4 py-2.5 text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-100 border border-white/5 rounded-tl-none'}`}>
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="flex gap-2 max-w-[85%]">
                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center">
                          <Bot className="w-4 h-4 text-white" />
                        </div>
                        <div className="bg-slate-800 border border-white/5 text-slate-100 rounded-2xl rounded-tl-none px-4 py-2.5 flex items-center gap-2">
                          <div className="flex gap-1 items-center h-4">
                            <motion.span 
                              animate={{ opacity: [0.4, 1, 0.4] }} 
                              transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                              className="w-1.5 h-1.5 bg-slate-400 rounded-full"
                            />
                            <motion.span 
                              animate={{ opacity: [0.4, 1, 0.4] }} 
                              transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                              className="w-1.5 h-1.5 bg-slate-400 rounded-full"
                            />
                            <motion.span 
                              animate={{ opacity: [0.4, 1, 0.4] }} 
                              transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                              className="w-1.5 h-1.5 bg-slate-400 rounded-full"
                            />
                          </div>
                          <span className="text-xs text-slate-400">Digitando...</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              <CardFooter className="p-4 bg-slate-900/50 border-t border-white/5">
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                  className="flex w-full gap-2"
                >
                  <Input 
                    placeholder="Digite sua mensagem..." 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={isLoading}
                    className="bg-slate-800/50 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-blue-500"
                  />
                  <Button type="submit" size="icon" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0">
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              </CardFooter>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
