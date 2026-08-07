-- Create Lead System Tables
CREATE TYPE public.lead_interest_level AS ENUM ('Alto', 'Médio', 'Baixo');
CREATE TYPE public.lead_status AS ENUM ('Novo', 'Contatado', 'Convertido', 'Descartado');

CREATE TABLE public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    profile_link TEXT,
    platform TEXT NOT NULL,
    public_text TEXT,
    keyword TEXT,
    interest_level public_interest_level DEFAULT 'Médio',
    status public_lead_status DEFAULT 'Novo',
    ai_summary TEXT,
    intent_detected BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Grant Access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage leads"
ON public.leads
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Lead Keywords Table
CREATE TABLE public.lead_keywords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword TEXT UNIQUE NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_keywords TO authenticated;
GRANT ALL ON public.lead_keywords TO service_role;

ALTER TABLE public.lead_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage keywords"
ON public.lead_keywords
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Seed default keywords
INSERT INTO public.lead_keywords (keyword) VALUES 
('IPTV'), ('TV Online'), ('TV Streaming'), ('Lista IPTV'), ('Canais ao vivo'), ('Assinatura IPTV')
ON CONFLICT (keyword) DO NOTHING;
