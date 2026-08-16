import React, { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { 
  Play, 
  Tv, 
  Smartphone, 
  Monitor, 
  ChevronRight, 
  CheckCircle2, 
  Star, 
  Plus, 
  Minus,
  MessageCircle,
  ShieldCheck,
  Zap,
  Globe,
  Clapperboard,
  Trophy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AIChat } from "@/components/landing-page/AIChat";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  const [activePlan, setActivePlan] = useState<"mensal" | "trimestral" | "anual">("mensal");

  const fadeIn = {
    initial: { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.6 }
  };

  const benefits = [
    { icon: <Monitor className="w-6 h-6" />, title: "HD, Full HD e 4K", desc: "Qualidade de cinema na sua casa." },
    { icon: <Globe className="w-6 h-6" />, title: "Conteúdo Global", desc: "Milhares de canais, filmes e séries." },
    { icon: <Zap className="w-6 h-6" />, title: "Sem Travamentos", desc: "Servidores de alta performance." },
    { icon: <ShieldCheck className="w-6 h-6" />, title: "Suporte 24/7", desc: "Estamos sempre aqui para ajudar." },
  ];

  const plans = [
    { id: "mensal", name: "Mensal", duration: "30 dias", price: "R$ 30", features: ["1 Tela", "Canais HD/Full HD/4K", "Filmes e Séries", "Suporte VIP"] },
    { id: "trimestral", name: "Trimestral", duration: "90 dias", price: "R$ 76,50", features: ["1 Tela", "Canais HD/Full HD/4K", "Filmes e Séries", "Suporte VIP", "Economia de 15%"], popular: true },
    { id: "semestral", name: "Semestral", duration: "180 dias", price: "R$ 144", features: ["1 Tela", "Canais HD/Full HD/4K", "Filmes e Séries", "Suporte VIP", "Economia de 20%"] },
    { id: "anual", name: "Anual", duration: "365 dias", price: "R$ 270", features: ["1 Tela", "Canais HD/Full HD/4K", "Filmes e Séries", "Suporte VIP", "Melhor Valor", "Economia de 25%"] },
  ];

  const devices = [
    { name: "Samsung TV", icon: <Tv /> },
    { name: "LG TV", icon: <Tv /> },
    { name: "Android TV", icon: <Tv /> },
    { name: "Fire Stick", icon: <Tv /> },
    { name: "TV Box", icon: <Monitor /> },
    { name: "Android", icon: <Smartphone /> },
    { name: "iPhone", icon: <Smartphone /> },
    { name: "PC", icon: <Monitor /> },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white selection:bg-blue-500 selection:text-white font-sans overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-40 border-b border-white/5 bg-slate-950/80 backdrop-blur-md">
        <div className="container mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Play className="w-6 h-6 fill-white text-white" />
            </div>
            <span className="text-2xl font-black tracking-tighter uppercase">AJP<span className="text-blue-500">VIP</span></span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
            <a href="#beneficios" className="hover:text-white transition-colors">Benefícios</a>
            <a href="#como-funciona" className="hover:text-white transition-colors">Como funciona</a>
            <a href="#planos" className="hover:text-white transition-colors">Planos</a>
            <a href="#faq" className="hover:text-white transition-colors">Dúvidas</a>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/auth" className="hidden sm:block text-sm font-medium hover:text-blue-500 transition-colors">Portal do Cliente</Link>
            <Button asChild className="bg-blue-600 hover:bg-blue-700 rounded-full px-6 h-11 font-bold">
              <a href="https://wa.me/5519981356505?text=Olá, gostaria de um teste grátis." target="_blank" rel="noopener noreferrer">Teste Grátis</a>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-20 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[800px] bg-blue-600/10 blur-[120px] rounded-full -z-10" />
        <div className="container mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="space-y-8"
            >
              <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 py-1.5 px-4 rounded-full font-semibold uppercase tracking-widest text-[10px]">
                🔥 O IPTV #1 do Brasil
              </Badge>
              <h1 className="text-5xl md:text-7xl font-black leading-[1.1] tracking-tight">
                O Melhor <span className="bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">IPTV Premium</span> para Toda a Família
              </h1>
              <p className="text-lg md:text-xl text-slate-400 max-w-xl leading-relaxed">
                Filmes, séries, canais ao vivo, esportes e muito mais em alta qualidade. Solicite seu teste gratuito em poucos segundos e transforme sua TV.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Button size="lg" className="h-14 px-8 rounded-full bg-blue-600 hover:bg-blue-700 text-lg font-bold shadow-xl shadow-blue-500/25 group transition-all" asChild>
                   <a href="https://wa.me/5519981356505?text=Olá, gostaria de um teste grátis." target="_blank" rel="noopener noreferrer">
                    <Zap className="w-5 h-5 mr-2 fill-white animate-pulse" />
                    Solicitar Teste Grátis
                  </a>
                </Button>
                <Button size="lg" variant="outline" className="h-14 px-8 rounded-full border-white/10 hover:bg-white/5 text-lg font-bold" onClick={() => (window as any).scrollToAIChat?.()}>
                  <MessageCircle className="w-5 h-5 mr-2" />
                  Conversar com a IA
                </Button>
              </div>
              <div className="flex items-center gap-6 pt-6 border-t border-white/5">
                <div className="flex -space-x-3">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="w-10 h-10 rounded-full border-2 border-slate-950 overflow-hidden bg-slate-800">
                      <img src={`https://i.pravatar.cc/100?img=${i+10}`} alt="User" className="w-full h-full object-cover opacity-80" />
                    </div>
                  ))}
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    {[1,2,3,4,5].map(i => <Star key={i} className="w-4 h-4 fill-yellow-500 text-yellow-500" />)}
                  </div>
                  <p className="text-sm font-medium text-slate-400">+5.000 clientes satisfeitos</p>
                </div>
              </div>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative lg:block hidden"
            >
              <div className="relative z-10 rounded-3xl overflow-hidden shadow-2xl shadow-blue-500/10 border border-white/10">
                <img 
                  src="https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&q=75&w=1200" 
                  alt="IPTV Content" 
                  loading="eager"
                  className="w-full aspect-[4/3] object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
                <div className="absolute bottom-6 left-6 right-6 p-6 bg-slate-900/60 backdrop-blur-md rounded-2xl border border-white/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-blue-400 font-bold mb-1">Passando agora</p>
                      <h4 className="font-bold text-lg">Final da Champions League</h4>
                    </div>
                    <Badge className="bg-red-500 font-bold uppercase text-[10px]">AO VIVO</Badge>
                  </div>
                </div>
              </div>
              {/* Floating Cards */}
              <motion.div 
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -top-10 -right-10 p-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
                    <Clapperboard className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Mais de</p>
                    <p className="text-sm font-black">20.000 Filmes</p>
                  </div>
                </div>
              </motion.div>
              <motion.div 
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className="absolute -bottom-10 -left-10 p-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                    <Trophy className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Todos os</p>
                    <p className="text-sm font-black">Canais de Esporte</p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="beneficios" className="py-24 bg-slate-900/30">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <h2 className="text-3xl md:text-5xl font-black tracking-tight">Vantagens de ser <span className="text-blue-500">VIP</span></h2>
            <p className="text-slate-400 text-lg">Oferecemos a melhor experiência de streaming do mercado, com tecnologia de ponta e conteúdo atualizado diariamente.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {benefits.map((benefit, i) => (
              <motion.div
                key={i}
                {...fadeIn}
                transition={{ delay: i * 0.1 }}
                className="p-8 rounded-3xl bg-slate-900 border border-white/5 hover:border-blue-500/30 transition-all group"
              >
                <div className="w-12 h-12 bg-blue-500/10 text-blue-500 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  {benefit.icon}
                </div>
                <h3 className="text-xl font-bold mb-3">{benefit.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{benefit.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works / Compatibility */}
      <section id="como-funciona" className="py-24">
        <div className="container mx-auto px-6">
          <div className="p-12 rounded-[40px] bg-gradient-to-br from-slate-900 to-slate-950 border border-white/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/5 blur-[100px] rounded-full" />
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div className="space-y-8">
                <h2 className="text-3xl md:text-5xl font-black leading-tight">Assista em qualquer <span className="text-blue-500">lugar.</span></h2>
                <p className="text-slate-400 text-lg">Nossa plataforma é compatível com praticamente todos os dispositivos inteligentes do mercado.</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {devices.map((device, i) => (
                    <div key={i} className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                      <div className="text-blue-500">{device.icon}</div>
                      <span className="text-xs font-bold uppercase tracking-wider">{device.name}</span>
                    </div>
                  ))}
                </div>
                <Button variant="link" className="text-blue-400 font-bold p-0 flex items-center gap-2 group">
                  Ver lista detalhada de aplicativos <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>
              <div className="relative">
                <img 
                  src="https://images.unsplash.com/photo-1595935736128-db120a273d63?auto=format&fit=crop&q=75&w=1000" 
                  alt="Devices" 
                  loading="lazy"
                  className="rounded-3xl shadow-2xl relative z-10"
                />
                <div className="absolute -inset-4 bg-blue-500/20 blur-2xl rounded-[40px] -z-10" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Plans Section */}
      <section id="planos" className="py-24 bg-slate-900/30">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <h2 className="text-3xl md:text-5xl font-black tracking-tight">Escolha o seu <span className="text-blue-500">Plano</span></h2>
            <p className="text-slate-400 text-lg">Preços justos para uma qualidade inigualável. Sem contratos abusivos ou taxas escondidas.</p>
          </div>
          
          <div className="grid lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
            {plans.map((plan, i) => (
              <motion.div
                key={i}
                {...fadeIn}
                transition={{ delay: i * 0.1 }}
                className={`relative p-8 rounded-[32px] border transition-all ${plan.popular ? 'bg-slate-900 border-blue-500 shadow-2xl shadow-blue-500/10' : 'bg-slate-950 border-white/5 hover:border-white/20'}`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-black uppercase px-4 py-1 rounded-full tracking-widest">
                    MAIS POPULAR
                  </div>
                )}
                <div className="mb-8">
                  <h3 className="text-2xl font-black mb-2">{plan.name}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black">{plan.price}</span>
                    <span className="text-slate-500 font-medium text-xs">/ {plan.duration}</span>
                  </div>
                </div>
                <div className="space-y-4 mb-8">
                  {plan.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <CheckCircle2 className={`w-5 h-5 ${plan.popular || feature.includes("Economia") ? 'text-blue-400' : 'text-slate-600'}`} />
                      <span className={`font-medium text-sm ${feature.includes("Economia") ? 'text-blue-400 font-bold' : 'text-slate-300'}`}>{feature}</span>
                    </div>
                  ))}
                </div>
                <Button asChild className={`w-full h-14 rounded-full font-bold text-lg ${plan.popular ? 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20' : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'}`}>
                  <a href={`https://wa.me/5519981356505?text=Olá! Gostaria de assinar o plano ${plan.name}.`} target="_blank" rel="noopener noreferrer">
                    Assinar Agora
                  </a>
                </Button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-24">
        <div className="container mx-auto px-6 max-w-3xl">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-3xl md:text-5xl font-black tracking-tight">Dúvidas <span className="text-blue-500">Frequentes</span></h2>
            <p className="text-slate-400">Tudo o que você precisa saber sobre o nosso serviço.</p>
          </div>
          <Accordion type="single" collapsible className="space-y-4">
            {[
              { q: "O que é IPTV?", a: "IPTV é a transmissão de conteúdo de televisão através da internet, permitindo que você assista canais ao vivo, filmes e séries em qualquer dispositivo conectado." },
              { q: "Quais os requisitos de internet?", a: "Recomendamos uma conexão de pelo menos 10 Mbps para canais HD e 25 Mbps para conteúdos em 4K." },
              { q: "Posso usar em quantos dispositivos?", a: "Cada plano básico permite o uso em uma tela simultânea. Oferecemos planos adicionais para mais telas, consulte nosso suporte." },
              { q: "Como recebo o acesso?", a: "Imediatamente após a confirmação do pagamento, você receberá seus dados de acesso via WhatsApp ou E-mail." },
              { q: "Tem garantia?", a: "Sim! Oferecemos teste gratuito para você validar a qualidade e temos suporte diário para resolver qualquer problema." }
            ].map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border border-white/5 bg-slate-900/50 rounded-2xl overflow-hidden px-6">
                <AccordionTrigger className="hover:no-underline font-bold text-lg py-6">{item.q}</AccordionTrigger>
                <AccordionContent className="text-slate-400 leading-relaxed pb-6">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-white/5 bg-slate-950">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div className="col-span-2 space-y-6">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Play className="w-5 h-5 fill-white text-white" />
                </div>
                <span className="text-xl font-black tracking-tighter uppercase">AJP<span className="text-blue-500">VIP</span></span>
              </div>
              <p className="text-slate-400 max-w-sm text-sm leading-relaxed">
                A melhor experiência em entretenimento digital. Milhares de canais, filmes e séries com a máxima qualidade e estabilidade.
              </p>
              <div className="flex gap-4">
                <a href="#" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-blue-600 transition-colors">
                  <Play className="w-4 h-4 fill-white text-white" />
                </a>
                <a href="#" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-blue-600 transition-colors">
                  <Play className="w-4 h-4 fill-white text-white" />
                </a>
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="font-bold uppercase tracking-widest text-[10px] text-blue-500">Links Úteis</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><a href="#beneficios" className="hover:text-white transition-colors">Benefícios</a></li>
                <li><a href="#como-funciona" className="hover:text-white transition-colors">Como funciona</a></li>
                <li><a href="#planos" className="hover:text-white transition-colors">Planos</a></li>
                <li><a href="#faq" className="hover:text-white transition-colors">FAQ</a></li>
              </ul>
            </div>
            <div className="space-y-4">
              <h4 className="font-bold uppercase tracking-widest text-[10px] text-blue-500">Suporte</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><a href="https://wa.me/5519981356505" className="hover:text-white transition-colors">WhatsApp</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Política de Privacidade</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Termos de Uso</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-500 font-medium">
            <p>© 2026 AJPVIP - Todos os direitos reservados.</p>
            <p>Desenvolvido com ❤️ para a melhor experiência.</p>
          </div>
        </div>
      </footer>

      {/* Floating AI Chat */}
      <AIChat />
    </div>
  );
}
