
-- Slug por revendedor + loja externa
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS store_slug text UNIQUE,
  ADD COLUMN IF NOT EXISTS store_title text,
  ADD COLUMN IF NOT EXISTS store_description text;

CREATE INDEX IF NOT EXISTS settings_store_slug_idx ON public.settings(lower(store_slug));

-- Compradores da loja (vinculados a uma conta auth.users)
CREATE TABLE IF NOT EXISTS public.store_buyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,                -- dono/revendedor (auth.users do admin)
  auth_user_id uuid NOT NULL,           -- comprador (auth.users)
  name text,
  phone text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, auth_user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_buyers TO authenticated;
GRANT ALL ON public.store_buyers TO service_role;

ALTER TABLE public.store_buyers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner reads buyers" ON public.store_buyers
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "buyer reads self" ON public.store_buyers
  FOR SELECT TO authenticated
  USING (auth.uid() = auth_user_id);

CREATE TRIGGER set_store_buyers_updated_at
  BEFORE UPDATE ON public.store_buyers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Permitir compras sem client (compradores da loja externa)
ALTER TABLE public.renewal_requests ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE public.renewal_requests ADD COLUMN IF NOT EXISTS buyer_id uuid;
CREATE INDEX IF NOT EXISTS renewal_requests_buyer_idx ON public.renewal_requests(buyer_id);

ALTER TABLE public.store_purchases ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE public.store_purchases ADD COLUMN IF NOT EXISTS buyer_id uuid;
ALTER TABLE public.store_purchases ADD COLUMN IF NOT EXISTS buyer_email text;
ALTER TABLE public.store_purchases ADD COLUMN IF NOT EXISTS buyer_name text;
CREATE INDEX IF NOT EXISTS store_purchases_buyer_idx ON public.store_purchases(buyer_id);

-- Função pública para resolver loja pelo slug (anônimo, sem PII)
CREATE OR REPLACE FUNCTION public.find_store_owner_by_slug(_slug text)
RETURNS TABLE(user_id uuid, store_title text, store_description text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.user_id, s.store_title, s.store_description
  FROM public.settings s
  WHERE lower(s.store_slug) = lower(_slug)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_store_owner_by_slug(text) TO anon, authenticated;

-- Função pública para listar produtos ativos de um dono (sem custo)
CREATE OR REPLACE FUNCTION public.list_store_products(_owner uuid)
RETURNS TABLE(key text, label text, sale_cents int, duration_days int, emoji text, gradient text, sort_order int, image_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT key, label, sale_cents, duration_days, emoji, gradient, sort_order, image_url
  FROM public.store_products
  WHERE user_id = _owner AND active = true
  ORDER BY sort_order ASC;
$$;

GRANT EXECUTE ON FUNCTION public.list_store_products(uuid) TO anon, authenticated;
