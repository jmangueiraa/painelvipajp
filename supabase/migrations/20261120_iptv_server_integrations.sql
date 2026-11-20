-- ==============================================================================
-- SQL SETUP: INTEGRAÇÃO COM SERVIDOR IPTV / P2P (API CENTRALIZADA)
-- Execute este script no SQL Editor do Supabase (https://supabase.com/dashboard)
-- Projeto: zfafucaxbktpifydecng
-- ==============================================================================

-- 1. Criação da tabela de integrações de servidor IPTV / P2P
CREATE TABLE IF NOT EXISTS public.iptv_server_integrations (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  server_name text NOT NULL DEFAULT 'RBOYS',
  base_url text NOT NULL,
  api_key text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Caso a tabela já existisse de forma parcial, garante a coluna is_active
ALTER TABLE public.iptv_server_integrations 
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 2. Permissões de acesso aos papéis
GRANT ALL ON public.iptv_server_integrations TO service_role;
GRANT ALL ON public.iptv_server_integrations TO authenticated;

-- 3. Habilitação de RLS (Row Level Security)
ALTER TABLE public.iptv_server_integrations ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de segurança (RLS)
DROP POLICY IF EXISTS "Owners manage IPTV server integration" ON public.iptv_server_integrations;
CREATE POLICY "Owners manage IPTV server integration" ON public.iptv_server_integrations
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access on iptv_server_integrations" ON public.iptv_server_integrations;
CREATE POLICY "Service role full access on iptv_server_integrations" ON public.iptv_server_integrations
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. Atualização imediata do cache do PostgREST
NOTIFY pgrst, 'reload schema';
