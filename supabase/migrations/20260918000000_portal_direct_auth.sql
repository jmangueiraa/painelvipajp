-- Consolidação do Esquema do Portal do Cliente e Autenticação
-- Cria as tabelas necessárias caso não existam e define as funções SECURITY DEFINER

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Tipos e Enums
DO $$ BEGIN
  CREATE TYPE public.client_status AS ENUM ('ativo', 'vencido', 'suspenso', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.charge_status AS ENUM ('pendente', 'paga', 'vencida', 'cancelada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.pix_key_type AS ENUM ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Tabela de Planos
CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  duration_days INTEGER NOT NULL DEFAULT 30,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabela de Servidores
CREATE TABLE IF NOT EXISTS public.servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Tabela de Clientes
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  server_id UUID REFERENCES public.servers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  doc TEXT,
  address TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  due_date DATE NOT NULL DEFAULT (CURRENT_DATE + 30),
  status public.client_status NOT NULL DEFAULT 'ativo',
  notes TEXT,
  internal_notes TEXT,
  portal_username TEXT,
  portal_password_hash TEXT,
  iptv_login TEXT,
  iptv_password TEXT,
  referral_code TEXT,
  referred_by UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  bonus_days INT NOT NULL DEFAULT 0,
  points INT DEFAULT 1,
  allowed_plan_ids JSONB DEFAULT '[]'::jsonb,
  login_count INT DEFAULT 0,
  last_login_at TIMESTAMPTZ,
  last_device TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garante colunas caso a tabela já existisse com estrutura antiga
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES public.servers(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS portal_username TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS portal_password_hash TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS iptv_login TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS iptv_password TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS bonus_days INT DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS points INT DEFAULT 1;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS allowed_plan_ids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS login_count INT DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS last_device TEXT;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "portal_anon_client_read" ON public.clients;
CREATE POLICY "portal_anon_client_read" ON public.clients
  FOR SELECT TO anon, authenticated, service_role
  USING (true);

DROP POLICY IF EXISTS "portal_anon_client_update" ON public.clients;
CREATE POLICY "portal_anon_client_update" ON public.clients
  FOR UPDATE TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

-- 5. Tabela de Pagamentos
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  charge_id UUID,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Tabela de Configurações
CREATE TABLE IF NOT EXISTS public.settings (
  user_id UUID PRIMARY KEY,
  company_name TEXT,
  pix_key TEXT,
  pix_key_type public.pix_key_type,
  pix_receiver TEXT,
  pix_city TEXT,
  default_message TEXT,
  default_renewal_days INTEGER NOT NULL DEFAULT 30,
  referral_reward_days INT NOT NULL DEFAULT 7,
  referral_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  app_android_url TEXT,
  app_ios_url TEXT,
  updates_movies_text TEXT,
  updates_series_text TEXT,
  updates_movies_updated_at TIMESTAMPTZ,
  updates_series_updated_at TIMESTAMPTZ,
  updates_games_text TEXT,
  updates_games_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Tabela de Conteúdos / Atualizações
CREATE TABLE IF NOT EXISTS public.content_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Políticas de leitura para tabelas auxiliares do portal
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plans_anon_read" ON public.plans;
CREATE POLICY "plans_anon_read" ON public.plans FOR SELECT TO anon, authenticated, service_role USING (true);

ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "servers_anon_read" ON public.servers;
CREATE POLICY "servers_anon_read" ON public.servers FOR SELECT TO anon, authenticated, service_role USING (true);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings_anon_read" ON public.settings;
CREATE POLICY "settings_anon_read" ON public.settings FOR SELECT TO anon, authenticated, service_role USING (true);

ALTER TABLE public.content_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "updates_anon_read" ON public.content_updates;
CREATE POLICY "updates_anon_read" ON public.content_updates FOR SELECT TO anon, authenticated, service_role USING (true);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payments_anon_read" ON public.payments;
CREATE POLICY "payments_anon_read" ON public.payments FOR SELECT TO anon, authenticated, service_role USING (true);

-- 8. Tabela de Sessões do Portal
CREATE TABLE IF NOT EXISTS public.portal_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_sessions_client_idx ON public.portal_sessions(client_id);
CREATE INDEX IF NOT EXISTS portal_sessions_token_hash_idx ON public.portal_sessions(token_hash);

ALTER TABLE public.portal_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "portal_sessions_allow_all" ON public.portal_sessions;
CREATE POLICY "portal_sessions_allow_all" ON public.portal_sessions
  FOR ALL TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.portal_sessions TO anon, authenticated, service_role;

-- 9. Tabela de Log de Acesso ao Portal
CREATE TABLE IF NOT EXISTS public.portal_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  user_id UUID,
  ip TEXT,
  os TEXT,
  browser TEXT,
  user_agent TEXT,
  event TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.portal_access_log TO anon, authenticated, service_role;

-- 10. Funções SECURITY DEFINER de Login e Sessão
CREATE OR REPLACE FUNCTION public.portal_login_client(
  _login TEXT,
  _password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_client RECORD;
  v_match BOOLEAN := false;
  v_phone_digits TEXT;
  v_login_digits TEXT;
  v_token TEXT;
  v_token_hash TEXT;
  v_expires TIMESTAMPTZ;
BEGIN
  v_login_digits := regexp_replace(_login, '\D', '', 'g');

  FOR v_client IN
    SELECT id, user_id, name, phone, email, doc, portal_username, portal_password_hash, iptv_login, iptv_password, login_count
    FROM public.clients
  LOOP
    v_phone_digits := regexp_replace(coalesce(v_client.phone, ''), '\D', '', 'g');

    IF (lower(trim(coalesce(v_client.portal_username, ''))) = lower(trim(_login)))
       OR (lower(trim(coalesce(v_client.iptv_login, ''))) = lower(trim(_login)))
       OR (lower(trim(coalesce(v_client.name, ''))) = lower(trim(_login)))
       OR (lower(trim(coalesce(v_client.email, ''))) = lower(trim(_login)))
       OR (length(v_login_digits) >= 8 AND v_phone_digits LIKE '%' || right(v_login_digits, 8))
       OR (length(v_login_digits) >= 11 AND regexp_replace(coalesce(v_client.doc, ''), '\D', '', 'g') = v_login_digits)
    THEN
      IF (trim(coalesce(v_client.iptv_password, '')) = trim(_password))
         OR (trim(coalesce(v_client.portal_password_hash, '')) = trim(_password))
         OR (lower(trim(coalesce(v_client.iptv_password, ''))) = lower(trim(_password)))
         OR (lower(trim(coalesce(v_client.portal_password_hash, ''))) = lower(trim(_password)))
         OR (length(v_phone_digits) >= 4 AND v_phone_digits LIKE '%' || trim(_password))
         OR (length(v_login_digits) >= 4 AND v_login_digits = trim(_password))
      THEN
        v_match := true;
        EXIT;
      END IF;
    END IF;
  END LOOP;

  IF NOT v_match THEN
    RETURN jsonb_build_object('success', false, 'error', 'Login ou senha incorretos.');
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');
  v_expires := now() + interval '30 days';

  INSERT INTO public.portal_sessions (client_id, token_hash, expires_at)
  VALUES (v_client.id, v_token_hash, v_expires);

  UPDATE public.clients
  SET login_count = coalesce(v_client.login_count, 0) + 1,
      last_login_at = now()
  WHERE id = v_client.id;

  RETURN jsonb_build_object(
    'success', true,
    'token', v_token,
    'expires_at', v_expires,
    'client_id', v_client.id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_login_client(TEXT, TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.portal_get_session(_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash TEXT;
  v_client_id UUID;
  v_client RECORD;
  v_plan RECORD;
  v_server RECORD;
  v_settings RECORD;
  v_payments JSONB;
  v_plans JSONB;
  v_updates JSONB;
BEGIN
  v_hash := encode(digest(_token, 'sha256'), 'hex');

  SELECT client_id INTO v_client_id
  FROM public.portal_sessions
  WHERE token_hash = v_hash AND expires_at > now();

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Sessão inválida');
  END IF;

  UPDATE public.portal_sessions SET last_seen_at = now() WHERE token_hash = v_hash;

  SELECT * INTO v_client FROM public.clients WHERE id = v_client_id;
  IF v_client.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Cliente não encontrado');
  END IF;

  SELECT id, name, price_cents, duration_days INTO v_plan FROM public.plans WHERE id = v_client.plan_id;
  SELECT id, name INTO v_server FROM public.servers WHERE id = v_client.server_id;
  SELECT * INTO v_settings FROM public.settings WHERE user_id = v_client.user_id;

  SELECT coalesce(jsonb_agg(p ORDER BY p.paid_at DESC), '[]'::jsonb) INTO v_payments
  FROM (
    SELECT id, amount_cents, paid_at, method FROM public.payments WHERE client_id = v_client.id LIMIT 50
  ) p;

  SELECT coalesce(jsonb_agg(pl ORDER BY pl.duration_days ASC), '[]'::jsonb) INTO v_plans
  FROM (
    SELECT id, name, price_cents, duration_days, active FROM public.plans WHERE user_id = v_client.user_id AND active = true
  ) pl;

  SELECT coalesce(jsonb_agg(u ORDER BY u.created_at DESC), '[]'::jsonb) INTO v_updates
  FROM (
    SELECT id, kind, title, description, image_url, created_at FROM public.content_updates WHERE user_id = v_client.user_id LIMIT 100
  ) u;

  RETURN jsonb_build_object(
    'client', jsonb_build_object(
      'id', v_client.id,
      'user_id', v_client.user_id,
      'name', v_client.name,
      'phone', v_client.phone,
      'due_date', v_client.due_date,
      'status', v_client.status,
      'price_cents', v_client.price_cents,
      'points', coalesce(v_client.points, 1),
      'iptv_login', v_client.iptv_login,
      'iptv_password', v_client.iptv_password,
      'referral_code', v_client.referral_code,
      'bonus_days', coalesce(v_client.bonus_days, 0)
    ),
    'plan', to_jsonb(v_plan),
    'server', to_jsonb(v_server),
    'payments', v_payments,
    'referrals', '[]'::jsonb,
    'settings', to_jsonb(v_settings),
    'plans', v_plans,
    'updates', v_updates
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_get_session(TEXT) TO anon, authenticated, service_role;

-- 11. Função de Validação de Sessão para Rotas de Pagamento PIX e Cartão
CREATE OR REPLACE FUNCTION public.portal_get_client_by_token(_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash TEXT;
  v_client_id UUID;
  v_client RECORD;
BEGIN
  v_hash := encode(digest(_token, 'sha256'), 'hex');

  SELECT client_id INTO v_client_id
  FROM public.portal_sessions
  WHERE token_hash = v_hash AND expires_at > now();

  IF v_client_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.portal_sessions SET last_seen_at = now() WHERE token_hash = v_hash;

  SELECT * INTO v_client FROM public.clients WHERE id = v_client_id;
  IF v_client.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_client.id,
    'user_id', v_client.user_id,
    'name', v_client.name,
    'phone', v_client.phone,
    'due_date', v_client.due_date,
    'status', v_client.status,
    'price_cents', v_client.price_cents,
    'plan_id', v_client.plan_id,
    'server_id', v_client.server_id,
    'iptv_login', v_client.iptv_login,
    'iptv_password', v_client.iptv_password,
    'referral_code', v_client.referral_code,
    'referred_by', v_client.referred_by,
    'bonus_days', coalesce(v_client.bonus_days, 0),
    'points', coalesce(v_client.points, 1)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_get_client_by_token(TEXT) TO anon, authenticated, service_role;

-- 12. Políticas e Permissões para Renewal Requests
ALTER TABLE public.renewal_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "renewal_requests_allow_all" ON public.renewal_requests;
CREATE POLICY "renewal_requests_allow_all" ON public.renewal_requests
  FOR ALL TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);
GRANT ALL ON public.renewal_requests TO anon, authenticated, service_role;

-- 13. Garante coluna mp_access_token e políticas em settings
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS mp_access_token TEXT;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings_allow_all" ON public.settings;
CREATE POLICY "settings_allow_all" ON public.settings
  FOR ALL TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);
GRANT ALL ON public.settings TO anon, authenticated, service_role;

-- 14. Insere o cliente de teste RB0001 caso não exista ainda
INSERT INTO public.clients (name, phone, due_date, iptv_login, iptv_password, portal_username, portal_password_hash, status, price_cents, user_id)
SELECT 'RB0001', '(19) 98135-6505', CURRENT_DATE + interval '30 days', 'RB0001', '301016', 'RB0001', '301016', 'ativo', 3000, (SELECT user_id FROM public.settings LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM public.clients WHERE lower(name) = 'rb0001' OR lower(iptv_login) = 'rb0001'
);

-- Garante que clientes existentes tenham user_id preenchido
UPDATE public.clients
SET user_id = (SELECT user_id FROM public.settings LIMIT 1)
WHERE user_id IS NULL;
