-- Tabela de dispositivos suportados
CREATE TABLE IF NOT EXISTS public.ai_agent_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT NOT NULL, -- 'Smart TV', 'TV Box', 'Celular Android', 'iPhone', 'Tablet', 'Computador'
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de aplicativos recomendados por dispositivo
CREATE TABLE IF NOT EXISTS public.ai_agent_apps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_category TEXT NOT NULL,
    app_name TEXT NOT NULL,
    description TEXT,
    tutorial_url TEXT,
    installation_steps JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de FAQ para a IA
CREATE TABLE IF NOT EXISTS public.ai_agent_faq (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    keywords TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de histórico de conversas do agente
CREATE TABLE IF NOT EXISTS public.ai_agent_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    messages JSONB DEFAULT '[]'::jsonb,
    device_info JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'em_aberto', -- 'em_aberto', 'concluido', 'transferido'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_devices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_apps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_faq TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_conversations TO authenticated;

GRANT ALL ON public.ai_agent_devices TO service_role;
GRANT ALL ON public.ai_agent_apps TO service_role;
GRANT ALL ON public.ai_agent_faq TO service_role;
GRANT ALL ON public.ai_agent_conversations TO service_role;

-- RLS
ALTER TABLE public.ai_agent_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_faq ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage AI agent data" ON public.ai_agent_devices FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage AI apps" ON public.ai_agent_apps FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage AI FAQ" ON public.ai_agent_faq FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage AI conversations" ON public.ai_agent_conversations FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Seed data for testing
INSERT INTO public.ai_agent_devices (name, category) VALUES 
('Samsung', 'Smart TV'),
('LG', 'Smart TV'),
('Android TV', 'TV Box'),
('Fire Stick', 'TV Box'),
('iPhone', 'iPhone'),
('Samsung Galaxy', 'Celular Android');

INSERT INTO public.ai_agent_apps (device_category, app_name, description, installation_steps) VALUES
('Smart TV', 'IPTV Smarters Pro', 'Aplicativo completo para visualização de conteúdo.', '["Abra a loja da TV", "Pesquise por Smarters Pro", "Instale e abra", "Insira os dados fornecidos"]'),
('Celular Android', 'AJP Player', 'Nosso aplicativo oficial para Android.', '["Baixe o APK pelo link enviado", "Autorize fontes desconhecidas", "Instale o app", "Faça login"]'),
('iPhone', 'GSE Smart IPTV', 'Melhor opção para iOS.', '["Abra a App Store", "Busque GSE Smart IPTV", "Baixe e adicione a playlist M3U"]');
