-- Adicionando campos avançados para IA na tabela de leads
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS funnel_stage TEXT,
ADD COLUMN IF NOT EXISTS urgency TEXT,
ADD COLUMN IF NOT EXISTS conversion_probability FLOAT DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS topics TEXT[],
ADD COLUMN IF NOT EXISTS positive_signals TEXT[],
ADD COLUMN IF NOT EXISTS negative_signals TEXT[],
ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS labels TEXT[];

-- Tabela para histórico de contatos (CRM)
CREATE TABLE public.lead_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'whatsapp', 'email', 'call', 'other'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_contacts TO authenticated;
GRANT ALL ON public.lead_contacts TO service_role;
ALTER TABLE public.lead_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage contacts"
ON public.lead_contacts FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Tabela para agendamento de follow-ups
CREATE TABLE public.lead_followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    scheduled_for TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'cancelled'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_followups TO authenticated;
GRANT ALL ON public.lead_followups TO service_role;
ALTER TABLE public.lead_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage followups"
ON public.lead_followups FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
