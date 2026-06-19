
-- Phone on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

-- Enums
DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM ('ativa','pendente','cancelada','vencida','teste_gratis');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_payment_method AS ENUM ('pix','cartao','boleto','dinheiro','manual','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- App plans (SaaS-level)
CREATE TABLE IF NOT EXISTS public.app_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL DEFAULT 0,
  duration_days integer NOT NULL DEFAULT 30,
  active boolean NOT NULL DEFAULT true,
  featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_plans TO authenticated;
GRANT ALL ON public.app_plans TO service_role;
ALTER TABLE public.app_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans read all auth" ON public.app_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "plans admin manage" ON public.app_plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER app_plans_updated_at BEFORE UPDATE ON public.app_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Subscriptions (one row per user)
CREATE TABLE IF NOT EXISTS public.app_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.app_plans(id) ON DELETE SET NULL,
  status public.subscription_status NOT NULL DEFAULT 'pendente',
  started_at timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz,
  cancelled_at timestamptz,
  payment_method public.subscription_payment_method,
  price_cents integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_subscriptions TO authenticated;
GRANT ALL ON public.app_subscriptions TO service_role;
ALTER TABLE public.app_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sub own select" ON public.app_subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sub admin manage" ON public.app_subscriptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER app_subscriptions_updated_at BEFORE UPDATE ON public.app_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS app_subscriptions_status_idx ON public.app_subscriptions(status);
CREATE INDEX IF NOT EXISTS app_subscriptions_user_idx ON public.app_subscriptions(user_id);

-- Subscription payments
CREATE TABLE IF NOT EXISTS public.app_subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.app_subscriptions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  method public.subscription_payment_method,
  paid_at timestamptz NOT NULL DEFAULT now(),
  reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_subscription_payments TO authenticated;
GRANT ALL ON public.app_subscription_payments TO service_role;
ALTER TABLE public.app_subscription_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subpay own select" ON public.app_subscription_payments FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "subpay admin manage" ON public.app_subscription_payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS app_subscription_payments_sub_idx ON public.app_subscription_payments(subscription_id);
CREATE INDEX IF NOT EXISTS app_subscription_payments_user_idx ON public.app_subscription_payments(user_id);

-- Seed default plans
INSERT INTO public.app_plans (name, description, price_cents, duration_days, featured)
SELECT * FROM (VALUES
  ('Mensal','Acesso completo por 30 dias',4990,30,false),
  ('Trimestral','3 meses com desconto',12990,90,true),
  ('Anual','12 meses com desconto máximo',39900,365,false)
) AS v(name, description, price_cents, duration_days, featured)
WHERE NOT EXISTS (SELECT 1 FROM public.app_plans);
