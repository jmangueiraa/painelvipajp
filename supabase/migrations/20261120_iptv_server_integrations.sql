-- Migration: Cria tabela para integração centralizada com a API do Servidor IPTV / P2P
CREATE TABLE IF NOT EXISTS public.iptv_server_integrations (
  user_id uuid PRIMARY KEY,
  server_name text NOT NULL DEFAULT 'RBOYS',
  base_url text NOT NULL,
  api_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Permissões e RLS
GRANT ALL ON public.iptv_server_integrations TO service_role;
GRANT SELECT ON public.iptv_server_integrations TO authenticated;

ALTER TABLE public.iptv_server_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage IPTV server integration" ON public.iptv_server_integrations;
CREATE POLICY "Owners manage IPTV server integration" ON public.iptv_server_integrations
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Colunas de fallback na tabela settings (para máxima compatibilidade retroativa)
ALTER TABLE IF EXISTS public.settings 
  ADD COLUMN IF NOT EXISTS iptv_server_name text DEFAULT 'RBOYS',
  ADD COLUMN IF NOT EXISTS iptv_api_url text,
  ADD COLUMN IF NOT EXISTS iptv_api_key text;
