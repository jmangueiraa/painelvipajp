-- ==============================================================================
-- PERMISSÕES PÚBLICAS PARA PRODUTOS DA LOJA E INCLUSÃO NO PORTAL DO CLIENTE
-- ==============================================================================

-- 1. Permite que anon e portal leiam produtos ativos da loja
GRANT SELECT ON public.store_products TO anon, authenticated, service_role;

ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_anon_store_products_read" ON public.store_products;
CREATE POLICY "portal_anon_store_products_read" ON public.store_products
  FOR SELECT TO anon, authenticated, service_role
  USING (active = true);

-- 2. Função RPC SECURITY DEFINER para listar produtos da loja com bypass de RLS
CREATE OR REPLACE FUNCTION public.portal_get_store_products()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_products JSONB;
BEGIN
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', coalesce(sp.key, sp.id::text),
      'label', sp.label,
      'price_cents', sp.sale_cents,
      'emoji', coalesce(sp.emoji, '🛒'),
      'gradient', coalesce(sp.gradient, 'from-emerald-500 to-teal-600'),
      'image_url', sp.image_url
    ) ORDER BY sp.sort_order ASC, sp.created_at ASC
  ), '[]'::jsonb)
  INTO v_products
  FROM public.store_products sp
  WHERE sp.active = true;

  RETURN v_products;
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_get_store_products() TO anon, authenticated, service_role;

-- 3. Atualiza portal_get_session para incluir store_products na carga inicial do painel
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
  v_store_products JSONB;
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

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', coalesce(sp.key, sp.id::text),
      'label', sp.label,
      'price_cents', sp.sale_cents,
      'emoji', coalesce(sp.emoji, '🛒'),
      'gradient', coalesce(sp.gradient, 'from-emerald-500 to-teal-600'),
      'image_url', sp.image_url
    ) ORDER BY sp.sort_order ASC, sp.created_at ASC
  ), '[]'::jsonb)
  INTO v_store_products
  FROM public.store_products sp
  WHERE sp.active = true;

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
    'updates', v_updates,
    'store_products', v_store_products
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_get_session(TEXT) TO anon, authenticated, service_role;
