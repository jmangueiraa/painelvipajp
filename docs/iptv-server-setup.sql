-- ==============================================================================
-- SQL SETUP: INTEGRAÇÃO COM SERVIDOR IPTV / P2P (API CENTRALIZADA)
-- Execute este script no SQL Editor do painel do Supabase
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.iptv_server_integrations (
  user_id uuid PRIMARY KEY,
  server_name text NOT NULL DEFAULT 'RBOYS',
  base_url text NOT NULL,
  api_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Permissões de acesso
GRANT ALL ON public.iptv_server_integrations TO service_role;
GRANT SELECT ON public.iptv_server_integrations TO authenticated;

-- RLS (Row Level Security)
ALTER TABLE public.iptv_server_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage IPTV server integration" ON public.iptv_server_integrations;
CREATE POLICY "Owners manage IPTV server integration" ON public.iptv_server_integrations
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Colunas de redundância/fallback na tabela settings
ALTER TABLE IF EXISTS public.settings 
  ADD COLUMN IF NOT EXISTS iptv_server_name text DEFAULT 'RBOYS',
  ADD COLUMN IF NOT EXISTS iptv_api_url text,
  ADD COLUMN IF NOT EXISTS iptv_api_key text;
