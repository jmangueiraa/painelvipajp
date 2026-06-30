
-- store_products
CREATE TABLE public.store_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  sale_cents int NOT NULL DEFAULT 0,
  cost_cents int NOT NULL DEFAULT 0,
  duration_days int NOT NULL DEFAULT 30,
  emoji text DEFAULT '🛒',
  gradient text DEFAULT 'from-emerald-500 to-teal-600',
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_products TO authenticated;
GRANT ALL ON public.store_products TO service_role;
ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages products" ON public.store_products FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER store_products_updated BEFORE UPDATE ON public.store_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- store_purchases
CREATE TABLE public.store_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.store_products(id) ON DELETE SET NULL,
  label text NOT NULL,
  sale_cents int NOT NULL DEFAULT 0,
  cost_cents int NOT NULL DEFAULT 0,
  duration_days int NOT NULL DEFAULT 30,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'ativo',
  renewal_request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_purchases TO authenticated;
GRANT ALL ON public.store_purchases TO service_role;
ALTER TABLE public.store_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages purchases" ON public.store_purchases FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER store_purchases_updated BEFORE UPDATE ON public.store_purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX store_purchases_user_due ON public.store_purchases(user_id, due_date);
CREATE INDEX store_purchases_client ON public.store_purchases(client_id);

-- Seed default products for each existing settings.user_id
CREATE OR REPLACE FUNCTION public.seed_default_store_products(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.store_products (user_id, key, label, sale_cents, cost_cents, duration_days, emoji, gradient, sort_order) VALUES
    (_user_id, 'chatgpt',    'ChatGPT Plus - 30 dias',     3000, 0, 30,  '🤖', 'from-emerald-500 to-teal-600',  1),
    (_user_id, 'spotify',    'Spotify Premium - 30 dias',  1500, 0, 30,  '🎵', 'from-green-500 to-emerald-600', 2),
    (_user_id, 'youtube',    'YouTube Premium - 30 dias',  1500, 0, 30,  '▶️', 'from-red-500 to-rose-600',      3),
    (_user_id, 'smatone',    'Smatone - 1 ano',            2000, 0, 365, '🔑', 'from-indigo-500 to-purple-600', 4),
    (_user_id, 'globoplay',  'Globo Play - 30 dias',       1500, 0, 30,  '📺', 'from-blue-500 to-sky-600',      5),
    (_user_id, 'primevideo', 'Prime Video - 30 dias',      1500, 0, 30,  '🎬', 'from-sky-500 to-blue-700',      6),
    (_user_id, 'netflix',    'Netflix 1 tela - 30 dias',   1500, 0, 30,  '🎞️', 'from-red-600 to-black',         7)
  ON CONFLICT (user_id, key) DO NOTHING;
END;
$$;

-- Seed for all existing owners
DO $$
DECLARE u uuid;
BEGIN
  FOR u IN SELECT DISTINCT user_id FROM public.settings LOOP
    PERFORM public.seed_default_store_products(u);
  END LOOP;
END $$;

-- Add to handle_new_user so new admins get default products
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, company_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), COALESCE(NEW.raw_user_meta_data->>'company_name', ''));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  INSERT INTO public.settings (user_id, subscription_expires_at)
  VALUES (NEW.id, now() + interval '7 days');
  PERFORM public.seed_default_store_products(NEW.id);
  RETURN NEW;
END;
$$;
