-- ==============================================================================
-- MIGRATION: AJP INDICA - Módulo Nativo de Indicação para o Painel AJP VIP
-- ==============================================================================

-- 1. Criação da Tabela de Parceiros / Indicadores
CREATE TABLE IF NOT EXISTS public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  client_id UUID,
  code VARCHAR(30) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  pix_key TEXT,
  pix_key_type TEXT DEFAULT 'cpf',
  status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'bloqueado')),
  balance_cents INTEGER DEFAULT 0,
  total_earned_cents INTEGER DEFAULT 0,
  total_withdrawn_cents INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Alteração segura na tabela de Clientes existente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'partner_id'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'partner_code'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN partner_code TEXT;
  END IF;
END $$;

-- 3. Fechamentos Semanais de Pagamento
CREATE TABLE IF NOT EXISTS public.partner_weekly_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES public.partners(id) ON DELETE CASCADE NOT NULL,
  cycle_number INTEGER,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  payment_due_date DATE NOT NULL,
  commissions_count INTEGER DEFAULT 0,
  total_cents INTEGER DEFAULT 0,
  status TEXT DEFAULT 'aberto' CHECK (status IN ('aberto', 'fechado', 'pago', 'cancelado')),
  pix_key TEXT,
  pix_key_type TEXT,
  pix_transaction_id TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Comissões dos Indicadores (R$ 20,00 na 1ª assinatura do cliente)
CREATE TABLE IF NOT EXISTS public.partner_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES public.partners(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  renewal_request_id UUID REFERENCES public.renewal_requests(id) ON DELETE SET NULL,
  mp_payment_id TEXT,
  amount_cents INTEGER DEFAULT 2000, -- R$ 20,00
  status TEXT DEFAULT 'aprovada' CHECK (status IN ('pendente', 'aprovada', 'paga', 'cancelada')),
  closing_id UUID REFERENCES public.partner_weekly_closings(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ DEFAULT now(),
  paid_at TIMESTAMPTZ,
  CONSTRAINT unique_commission_per_client UNIQUE (client_id)
);

-- 5. Extrato e Histórico da Carteira do Indicador
CREATE TABLE IF NOT EXISTS public.partner_wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES public.partners(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('comissao_creditada', 'saque_pix', 'ajuste', 'estorno')),
  amount_cents INTEGER NOT NULL,
  balance_after_cents INTEGER NOT NULL,
  description TEXT NOT NULL,
  reference_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Log de Cliques e Visitas no Link do Indicador
CREATE TABLE IF NOT EXISTS public.partner_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES public.partners(id) ON DELETE CASCADE NOT NULL,
  ip TEXT,
  user_agent TEXT,
  referer TEXT,
  converted_to_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Configurações Globais do Programa AJP INDICA
CREATE TABLE IF NOT EXISTS public.partner_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  commission_cents INTEGER DEFAULT 2000,
  is_enabled BOOLEAN DEFAULT true,
  auto_approve BOOLEAN DEFAULT true,
  terms_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Índices para Otimização de Consultas
CREATE INDEX IF NOT EXISTS idx_partners_user_id ON public.partners(user_id);
CREATE INDEX IF NOT EXISTS idx_partners_auth_user_id ON public.partners(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_partners_code ON public.partners(code);
CREATE INDEX IF NOT EXISTS idx_clients_partner_id ON public.clients(partner_id);
CREATE INDEX IF NOT EXISTS idx_clients_partner_code ON public.clients(partner_code);
CREATE INDEX IF NOT EXISTS idx_commissions_partner_id ON public.partner_commissions(partner_id);
CREATE INDEX IF NOT EXISTS idx_commissions_client_id ON public.partner_commissions(client_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON public.partner_commissions(status);
CREATE INDEX IF NOT EXISTS idx_closings_partner_id ON public.partner_weekly_closings(partner_id);
CREATE INDEX IF NOT EXISTS idx_closings_payment_due_date ON public.partner_weekly_closings(payment_due_date);
CREATE INDEX IF NOT EXISTS idx_wallet_partner_id ON public.partner_wallet_transactions(partner_id);
CREATE INDEX IF NOT EXISTS idx_clicks_partner_id ON public.partner_clicks(partner_id);

-- 9. Habilitação de RLS (Row Level Security)
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_weekly_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_settings ENABLE ROW LEVEL SECURITY;

-- 10. Políticas de Segurança e Permissões Completas
DROP POLICY IF EXISTS admin_all_partners ON public.partners;
DROP POLICY IF EXISTS partner_own_profile ON public.partners;
DROP POLICY IF EXISTS partner_update_own_pix ON public.partners;
DROP POLICY IF EXISTS partners_all_access ON public.partners;
CREATE POLICY partners_all_access ON public.partners
  FOR ALL TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS admin_all_commissions ON public.partner_commissions;
DROP POLICY IF EXISTS partner_own_commissions ON public.partner_commissions;
DROP POLICY IF EXISTS partner_commissions_all_access ON public.partner_commissions;
CREATE POLICY partner_commissions_all_access ON public.partner_commissions
  FOR ALL TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS admin_all_closings ON public.partner_weekly_closings;
DROP POLICY IF EXISTS partner_own_closings ON public.partner_weekly_closings;
DROP POLICY IF EXISTS partner_weekly_closings_all_access ON public.partner_weekly_closings;
CREATE POLICY partner_weekly_closings_all_access ON public.partner_weekly_closings
  FOR ALL TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS admin_all_wallet ON public.partner_wallet_transactions;
DROP POLICY IF EXISTS partner_own_wallet ON public.partner_wallet_transactions;
DROP POLICY IF EXISTS partner_wallet_transactions_all_access ON public.partner_wallet_transactions;
CREATE POLICY partner_wallet_transactions_all_access ON public.partner_wallet_transactions
  FOR ALL TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS admin_all_clicks ON public.partner_clicks;
DROP POLICY IF EXISTS partner_own_clicks ON public.partner_clicks;
DROP POLICY IF EXISTS partner_clicks_all_access ON public.partner_clicks;
CREATE POLICY partner_clicks_all_access ON public.partner_clicks
  FOR ALL TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS admin_all_settings ON public.partner_settings;
DROP POLICY IF EXISTS partner_settings_all_access ON public.partner_settings;
CREATE POLICY partner_settings_all_access ON public.partner_settings
  FOR ALL TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.partners TO anon, authenticated, service_role;
GRANT ALL ON public.partner_commissions TO anon, authenticated, service_role;
GRANT ALL ON public.partner_weekly_closings TO anon, authenticated, service_role;
GRANT ALL ON public.partner_wallet_transactions TO anon, authenticated, service_role;
GRANT ALL ON public.partner_clicks TO anon, authenticated, service_role;
GRANT ALL ON public.partner_settings TO anon, authenticated, service_role;
