-- ==============================================================================
-- PORTAL ADM: Funções SECURITY DEFINER protegidas para gestão via Portal
-- Permite que /api/public/portal/admin leia/edite catálogo e clientes mesmo
-- quando o ambiente usa a chave anon/publishable com RLS ativo.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public._portal_assert_admin_key(_admin_key TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF _admin_key IS DISTINCT FROM '77c831de3eeaacea20c05c3e5362893ebabc86f4278cec9206f25a5970a9bcb0' THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- 1. Catálogo completo do ADM (planos, servidores, compras da loja)
CREATE OR REPLACE FUNCTION public.portal_admin_get_catalog(
  _admin_key TEXT,
  _owner_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_owner UUID;
  v_plans JSONB;
  v_servers JSONB;
  v_purchases JSONB;
BEGIN
  PERFORM public._portal_assert_admin_key(_admin_key);

  v_owner := coalesce(
    _owner_id,
    (SELECT user_id FROM public.settings LIMIT 1),
    (SELECT user_id FROM public.clients WHERE user_id IS NOT NULL LIMIT 1)
  );

  SELECT coalesce(jsonb_agg(row_to_json(p) ORDER BY p.duration_days ASC), '[]'::jsonb)
  INTO v_plans
  FROM (
    SELECT id, user_id, name, price_cents, duration_days, description, active
    FROM public.plans
    WHERE v_owner IS NULL OR user_id = v_owner
  ) p;

  SELECT coalesce(jsonb_agg(row_to_json(s) ORDER BY s.name ASC), '[]'::jsonb)
  INTO v_servers
  FROM (
    SELECT id, user_id, name, credit_cost_cents
    FROM public.servers
    WHERE v_owner IS NULL OR user_id = v_owner
  ) s;

  SELECT coalesce(jsonb_agg(row_to_json(sp) ORDER BY sp.purchased_at DESC), '[]'::jsonb)
  INTO v_purchases
  FROM (
    SELECT id, client_id, product_id, label, sale_cents, cost_cents, purchased_at, buyer_name
    FROM public.store_purchases
    WHERE v_owner IS NULL OR user_id = v_owner
    ORDER BY purchased_at DESC
    LIMIT 200
  ) sp;

  RETURN jsonb_build_object(
    'plans', v_plans,
    'servers', v_servers,
    'purchases', v_purchases
  );
END;
$$;

-- 2. Cadastrar ou editar cliente
CREATE OR REPLACE FUNCTION public.portal_admin_upsert_client(
  _admin_key TEXT,
  _owner_id UUID,
  _id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM public._portal_assert_admin_key(_admin_key);

  IF _id IS NULL THEN
    INSERT INTO public.clients (
      user_id, name, phone, iptv_login, iptv_password,
      plan_id, server_id, price_cents, points, due_date,
      status, auto_charge, notes, referred_by, partner_id, partner_code
    )
    VALUES (
      _owner_id,
      _payload->>'name',
      _payload->>'phone',
      NULLIF(_payload->>'iptv_login', ''),
      NULLIF(_payload->>'iptv_password', ''),
      NULLIF(_payload->>'plan_id', '')::UUID,
      NULLIF(_payload->>'server_id', '')::UUID,
      coalesce((_payload->>'price_cents')::INT, 0),
      coalesce((_payload->>'points')::INT, 1),
      (_payload->>'due_date')::DATE,
      coalesce((_payload->>'status')::public.client_status, 'ativo'::public.client_status),
      coalesce((_payload->>'auto_charge')::BOOLEAN, true),
      NULLIF(_payload->>'notes', ''),
      NULLIF(_payload->>'referred_by', '')::UUID,
      NULLIF(_payload->>'partner_id', '')::UUID,
      NULLIF(_payload->>'partner_code', '')
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.clients
    SET
      name = _payload->>'name',
      phone = _payload->>'phone',
      iptv_login = NULLIF(_payload->>'iptv_login', ''),
      iptv_password = NULLIF(_payload->>'iptv_password', ''),
      plan_id = NULLIF(_payload->>'plan_id', '')::UUID,
      server_id = NULLIF(_payload->>'server_id', '')::UUID,
      price_cents = coalesce((_payload->>'price_cents')::INT, price_cents),
      points = coalesce((_payload->>'points')::INT, points),
      due_date = coalesce((_payload->>'due_date')::DATE, due_date),
      status = coalesce((_payload->>'status')::public.client_status, status),
      auto_charge = coalesce((_payload->>'auto_charge')::BOOLEAN, auto_charge),
      notes = NULLIF(_payload->>'notes', ''),
      referred_by = CASE WHEN _payload ? 'referred_by' THEN NULLIF(_payload->>'referred_by', '')::UUID ELSE referred_by END,
      partner_id = CASE WHEN _payload ? 'partner_id' THEN NULLIF(_payload->>'partner_id', '')::UUID ELSE partner_id END,
      partner_code = CASE WHEN _payload ? 'partner_code' THEN NULLIF(_payload->>'partner_code', '') ELSE partner_code END
    WHERE id = _id
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

-- 3. Excluir cliente
CREATE OR REPLACE FUNCTION public.portal_admin_delete_client(
  _admin_key TEXT,
  _id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public._portal_assert_admin_key(_admin_key);
  DELETE FROM public.clients WHERE id = _id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. Cadastrar ou editar produto da loja
CREATE OR REPLACE FUNCTION public.portal_admin_upsert_product(
  _admin_key TEXT,
  _owner_id UUID,
  _id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM public._portal_assert_admin_key(_admin_key);

  IF _id IS NULL THEN
    INSERT INTO public.store_products (
      user_id, key, label, sale_cents, cost_cents,
      duration_days, emoji, gradient, active, image_url
    )
    VALUES (
      _owner_id,
      _payload->>'key',
      _payload->>'label',
      coalesce((_payload->>'sale_cents')::INT, 0),
      coalesce((_payload->>'cost_cents')::INT, 0),
      coalesce((_payload->>'duration_days')::INT, 30),
      coalesce(NULLIF(_payload->>'emoji', ''), '🛒'),
      coalesce(NULLIF(_payload->>'gradient', ''), 'from-emerald-500 to-teal-600'),
      coalesce((_payload->>'active')::BOOLEAN, true),
      NULLIF(_payload->>'image_url', '')
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.store_products
    SET
      key = coalesce(NULLIF(_payload->>'key', ''), key),
      label = _payload->>'label',
      sale_cents = coalesce((_payload->>'sale_cents')::INT, sale_cents),
      cost_cents = coalesce((_payload->>'cost_cents')::INT, cost_cents),
      duration_days = coalesce((_payload->>'duration_days')::INT, duration_days),
      emoji = coalesce(NULLIF(_payload->>'emoji', ''), emoji),
      active = coalesce((_payload->>'active')::BOOLEAN, active),
      image_url = NULLIF(_payload->>'image_url', '')
    WHERE id = _id
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_admin_delete_product(
  _admin_key TEXT,
  _id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public._portal_assert_admin_key(_admin_key);
  DELETE FROM public.store_products WHERE id = _id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 5. Cadastrar ou remover servidor IPTV
CREATE OR REPLACE FUNCTION public.portal_admin_upsert_server(
  _admin_key TEXT,
  _owner_id UUID,
  _id UUID,
  _payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM public._portal_assert_admin_key(_admin_key);

  IF _id IS NULL THEN
    INSERT INTO public.servers (user_id, name, credit_cost_cents)
    VALUES (
      _owner_id,
      _payload->>'name',
      coalesce((_payload->>'credit_cost_cents')::INT, 0)
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.servers
    SET
      name = _payload->>'name',
      credit_cost_cents = coalesce((_payload->>'credit_cost_cents')::INT, credit_cost_cents)
    WHERE id = _id
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_admin_delete_server(
  _admin_key TEXT,
  _id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public._portal_assert_admin_key(_admin_key);
  DELETE FROM public.servers WHERE id = _id;
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public._portal_assert_admin_key(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_admin_get_catalog(TEXT, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_admin_upsert_client(TEXT, UUID, UUID, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_admin_delete_client(TEXT, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_admin_upsert_product(TEXT, UUID, UUID, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_admin_delete_product(TEXT, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_admin_upsert_server(TEXT, UUID, UUID, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_admin_delete_server(TEXT, UUID) TO anon, authenticated, service_role;
