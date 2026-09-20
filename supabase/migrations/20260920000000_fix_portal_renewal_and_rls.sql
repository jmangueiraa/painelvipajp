-- ==============================================================================
-- CORREÇÃO DE RENOVAÇÃO DO PORTAL E PERMISSÕES DE CLIENTES (RLS E RPC)
-- Execute no Editor SQL do Supabase (projeto zfafucaxbktpifydecng)
-- ==============================================================================

-- 1. Políticas RLS para tabela clients (permite leitura e atualização segura pelo portal)
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

GRANT ALL ON public.clients TO anon, authenticated, service_role;

-- 2. Políticas RLS para tabela payments (permite registro de pagamentos pelo portal)
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_anon_payments_all" ON public.payments;
CREATE POLICY "portal_anon_payments_all" ON public.payments
  FOR ALL TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.payments TO anon, authenticated, service_role;

-- 3. Função RPC com SECURITY DEFINER para finalizar renovação atomicamente
-- Bypassa qualquer restrição de RLS e calcula a nova data de forma exata.
CREATE OR REPLACE FUNCTION public.portal_finalize_client_renewal(
  _client_id UUID,
  _days INT,
  _user_id UUID DEFAULT NULL,
  _amount_cents INT DEFAULT NULL,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_client RECORD;
  v_new_due DATE;
  v_today DATE := CURRENT_DATE;
  v_months INT;
BEGIN
  -- 1. Busca o cliente atual
  SELECT id, user_id, name, phone, due_date, status, price_cents
  INTO v_client
  FROM public.clients
  WHERE id = _client_id;

  IF v_client.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente não encontrado');
  END IF;

  -- 2. Calcula novo vencimento:
  -- Se o cliente já está vencido ou sem data, renova a partir de HOJE.
  -- Se o cliente ainda tem dias válidos (due_date >= hoje), acrescenta aos dias existentes.
  IF v_client.due_date IS NULL OR v_client.due_date < v_today THEN
    IF _days = 365 THEN
      v_new_due := v_today + interval '12 months';
    ELSIF _days IN (30, 90, 180) THEN
      v_months := _days / 30;
      v_new_due := v_today + (v_months || ' months')::interval;
    ELSE
      v_new_due := v_today + (_days || ' days')::interval;
    END IF;
  ELSE
    IF _days = 365 THEN
      v_new_due := v_client.due_date + interval '12 months';
    ELSIF _days IN (30, 90, 180) THEN
      v_months := _days / 30;
      v_new_due := v_client.due_date + (v_months || ' months')::interval;
    ELSE
      v_new_due := v_client.due_date + (_days || ' days')::interval;
    END IF;
  END IF;

  -- 3. Atualiza o vencimento e status do cliente
  UPDATE public.clients
  SET due_date = v_new_due,
      status = 'ativo',
      updated_at = now()
  WHERE id = _client_id;

  -- 4. Registra no histórico de pagamentos (se fornecido valor)
  IF _amount_cents IS NOT NULL AND _amount_cents > 0 THEN
    INSERT INTO public.payments (client_id, user_id, amount_cents, paid_at, method, notes)
    VALUES (
      _client_id,
      coalesce(v_client.user_id, _user_id, (SELECT user_id FROM public.settings LIMIT 1)),
      _amount_cents,
      now(),
      'pix_mercadopago',
      coalesce(_notes, 'Renovação ' || _days || ' dias - Mercado Pago')
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'client_id', v_client.id,
    'name', v_client.name,
    'phone', v_client.phone,
    'old_due_date', v_client.due_date,
    'new_due_date', v_new_due
  );
END;
$$;

-- 4. Concede permissão de execução da função para anon, authenticated e service_role
REVOKE ALL ON FUNCTION public.portal_finalize_client_renewal(UUID, INT, UUID, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_finalize_client_renewal(UUID, INT, UUID, INT, TEXT) TO anon, authenticated, service_role;
