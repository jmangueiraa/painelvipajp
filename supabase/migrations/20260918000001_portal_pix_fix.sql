-- ==============================================================================
-- CORREÇÃO DE PERMISSÕES E SESSÃO PARA GERAÇÃO DE PIX E CARTÃO NO PORTAL
-- Execute no Editor SQL do Supabase do projeto AJPVIP (zfafucaxbktpifydecng)
-- ==============================================================================

-- 1. Garante coluna mp_access_token em settings
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS mp_access_token TEXT;

-- 2. Políticas RLS de Leitura/Escrita para settings (anon e service_role)
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings_allow_all" ON public.settings;
CREATE POLICY "settings_allow_all" ON public.settings
  FOR ALL TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);
GRANT ALL ON public.settings TO anon, authenticated, service_role;

-- 3. Políticas RLS para portal_sessions
ALTER TABLE public.portal_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "portal_sessions_allow_all" ON public.portal_sessions;
CREATE POLICY "portal_sessions_allow_all" ON public.portal_sessions
  FOR ALL TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);
GRANT ALL ON public.portal_sessions TO anon, authenticated, service_role;

-- 4. Políticas RLS para renewal_requests (solicitações de PIX e renovação)
ALTER TABLE public.renewal_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "renewal_requests_allow_all" ON public.renewal_requests;
CREATE POLICY "renewal_requests_allow_all" ON public.renewal_requests
  FOR ALL TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);
GRANT ALL ON public.renewal_requests TO anon, authenticated, service_role;

-- 5. Função RPC SECURITY DEFINER para obter cliente direto pelo token
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
    'user_id', coalesce(v_client.user_id, (SELECT user_id FROM public.settings LIMIT 1)),
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

-- 6. Atualiza portal_get_session para incluir user_id no objeto client
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
      'user_id', coalesce(v_client.user_id, (SELECT user_id FROM public.settings LIMIT 1)),
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

-- 7. Garante que clientes sem user_id sejam vinculados ao primeiro user_id de settings
UPDATE public.clients
SET user_id = (SELECT user_id FROM public.settings LIMIT 1)
WHERE user_id IS NULL;
