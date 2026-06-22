
-- 1) Clientes: código de indicação, indicador e dias bônus
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS referral_code TEXT,
  ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bonus_days INT NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS clients_referral_code_uq ON public.clients(referral_code) WHERE referral_code IS NOT NULL;

-- Gerador de código (slug do nome + sufixo aleatório)
CREATE OR REPLACE FUNCTION public.gen_referral_code(_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  base TEXT;
  suffix TEXT;
  candidate TEXT;
BEGIN
  base := UPPER(REGEXP_REPLACE(COALESCE(_name, 'CLI'), '[^A-Za-z0-9]', '', 'g'));
  IF base = '' THEN base := 'CLI'; END IF;
  base := SUBSTRING(base FROM 1 FOR 8);
  LOOP
    suffix := UPPER(SUBSTRING(MD5(RANDOM()::text || clock_timestamp()::text) FROM 1 FOR 4));
    candidate := base || '-' || suffix;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.clients WHERE referral_code = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;

-- Trigger para preencher código em todo cliente novo / atualizado sem código
CREATE OR REPLACE FUNCTION public.set_client_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.referral_code IS NULL OR NEW.referral_code = '' THEN
    NEW.referral_code := public.gen_referral_code(NEW.name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_ref_code ON public.clients;
CREATE TRIGGER trg_clients_ref_code
BEFORE INSERT OR UPDATE OF name ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.set_client_referral_code();

-- Preenche códigos para clientes existentes
UPDATE public.clients SET referral_code = public.gen_referral_code(name) WHERE referral_code IS NULL;

-- 2) Settings: bônus de indicação
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS referral_reward_days INT NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS referral_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- 3) OTP do portal
CREATE TABLE IF NOT EXISTS public.portal_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_digits TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_otp_phone_idx ON public.portal_otp_codes(whatsapp_digits, created_at DESC);

GRANT ALL ON public.portal_otp_codes TO service_role;
ALTER TABLE public.portal_otp_codes ENABLE ROW LEVEL SECURITY;
-- Sem políticas: acesso só via service role (rotas públicas)

-- 4) Sessões do portal
CREATE TABLE IF NOT EXISTS public.portal_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_sessions_client_idx ON public.portal_sessions(client_id);

GRANT ALL ON public.portal_sessions TO service_role;
ALTER TABLE public.portal_sessions ENABLE ROW LEVEL SECURITY;
-- Sem políticas: acesso só via service role

-- 5) Solicitações de renovação feitas pelo portal
CREATE TABLE IF NOT EXISTS public.renewal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  days INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS renewal_requests_user_idx ON public.renewal_requests(user_id, status);

GRANT SELECT, UPDATE, DELETE ON public.renewal_requests TO authenticated;
GRANT ALL ON public.renewal_requests TO service_role;
ALTER TABLE public.renewal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_renewal_requests" ON public.renewal_requests
FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6) Aplicar bônus de indicação quando indicado faz 1º pagamento
CREATE OR REPLACE FUNCTION public.apply_referral_bonus()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client public.clients%ROWTYPE;
  v_referrer public.clients%ROWTYPE;
  v_settings public.settings%ROWTYPE;
  v_paid_count INT;
BEGIN
  SELECT * INTO v_client FROM public.clients WHERE id = NEW.client_id;
  IF v_client.id IS NULL OR v_client.referred_by IS NULL THEN
    RETURN NEW;
  END IF;

  -- só na 1ª paga
  SELECT COUNT(*) INTO v_paid_count FROM public.payments WHERE client_id = NEW.client_id;
  IF v_paid_count <> 1 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_referrer FROM public.clients WHERE id = v_client.referred_by;
  IF v_referrer.id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_settings FROM public.settings WHERE user_id = v_referrer.user_id;
  IF v_settings.referral_enabled IS DISTINCT FROM TRUE THEN RETURN NEW; END IF;

  UPDATE public.clients
  SET bonus_days = bonus_days + COALESCE(v_settings.referral_reward_days, 7),
      due_date = due_date + COALESCE(v_settings.referral_reward_days, 7)
  WHERE id = v_referrer.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_referral_bonus ON public.payments;
CREATE TRIGGER trg_apply_referral_bonus
AFTER INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.apply_referral_bonus();
