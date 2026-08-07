import { createFileRoute } from "@tanstack/react-router";
import { AIChat } from "@/components/landing-page/AIChat";
import { Play, MessageCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/ai-agent")({
  component: AIAgentPublicPage,
});

function AIAgentPublicPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white selection:bg-blue-500 selection:text-white font-sans flex flex-col items-center justify-center p-6">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[800px] bg-blue-600/10 blur-[120px] rounded-full -z-10" />
      
      <div className="w-full max-w-4xl space-y-8 text-center">
        <div className="flex flex-col items-center gap-4">
          <Link to="/" className="flex items-center gap-2 mb-8">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Play className="w-7 h-7 fill-white text-white" />
            </div>
            <span className="text-3xl font-black tracking-tighter uppercase">AJP<span className="text-blue-500">VIP</span></span>
          </Link>
          
          <h1 className="text-4xl md:text-6xl font-black leading-tight tracking-tight">
            Assistente de Suporte <span className="bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">Inteligente</span>
          </h1>
          
          <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Precisa de ajuda com a instalação? Nosso agente de IA está pronto para guiar você passo a passo em qualquer dispositivo.
          </p>
        </div>

        <div className="relative p-1 bg-gradient-to-b from-blue-500/20 to-transparent rounded-3xl">
          <div className="bg-slate-900/50 backdrop-blur-xl rounded-[22px] p-8 border border-white/5 space-y-6">
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-20 h-20 bg-blue-600/20 rounded-full flex items-center justify-center border border-blue-500/30">
                <MessageCircle className="w-10 h-10 text-blue-500" />
              </div>
              <p className="text-slate-300">
                Clique no ícone flutuante no canto inferior direito para iniciar seu atendimento.
              </p>
              <Button 
                size="lg" 
                className="bg-blue-600 hover:bg-blue-700 rounded-full px-8 font-bold"
                onClick={() => (window as any).scrollToAIChat?.()}
              >
                Abrir Chat de Suporte
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-center gap-4 pt-8">
          <Button variant="link" asChild className="text-slate-400 hover:text-white">
            <Link to="/">Voltar para Home</Link>
          </Button>
          <Button variant="link" asChild className="text-slate-400 hover:text-white">
            <a href="https://wa.me/5519981356505" target="_blank" rel="noopener noreferrer">Falar com Humano</a>
          </Button>
        </div>
      </div>

      <AIChat />
    </div>
  );
}
