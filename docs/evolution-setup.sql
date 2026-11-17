-- Aplicar manualmente no banco externo existente antes de configurar a Evolution.
-- Não altera clientes, pagamentos ou credenciais anteriores.
CREATE TABLE IF NOT EXISTS public.evolution_integrations (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  base_url text NOT NULL,
  instance_name text NOT NULL,
  api_key text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.evolution_integrations TO service_role;
GRANT SELECT (user_id, base_url, instance_name, updated_at) ON public.evolution_integrations TO authenticated;
REVOKE ALL ON public.evolution_integrations FROM anon;
ALTER TABLE public.evolution_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners read Evolution connection metadata" ON public.evolution_integrations;
CREATE POLICY "Owners read Evolution connection metadata" ON public.evolution_integrations FOR SELECT TO authenticated USING (auth.uid() = user_id);