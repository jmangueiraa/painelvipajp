-- ==============================================================================
-- MANTER DATA FIXA DE VENCIMENTO NAS RENOVAÇÕES
-- Exemplo: Se o plano de João vence dia 20/09/2026 e ele pagou dia 18/09 ou 21/09,
-- o próximo vencimento será 20/10/2026.
-- Execute no Editor SQL do Supabase
-- ==============================================================================

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

  -- 2. Identifica se o plano é baseado em meses
  IF _days = 365 THEN
    v_months := 12;
  ELSIF _days IN (30, 60, 90, 180) THEN
    v_months := _days / 30;
  ELSIF _days >= 28 AND _days <= 31 THEN
    v_months := 1;
  ELSE
    v_months := 0;
  END IF;

  -- 3. Calcula novo vencimento preservando a DATA FIXA
  IF v_client.due_date IS NULL THEN
    -- Cliente sem vencimento prévio: calcula a partir de hoje
    IF v_months > 0 THEN
      v_new_due := (v_today + (v_months || ' months')::interval)::DATE;
    ELSE
      v_new_due := (v_today + (_days || ' days')::interval)::DATE;
    END IF;
  ELSE
    IF v_months > 0 THEN
      IF v_client.due_date >= v_today THEN
        -- Em dia ou antecipado (ex: vence 20/09 e pagou 18/09 ou 20/09):
        -- Soma os meses mantendo o dia fixo (ex: 20/10)
        v_new_due := (v_client.due_date + (v_months || ' months')::interval)::DATE;
      ELSE
        -- Em atraso (ex: vencia 20/09 e pagou 21/09):
        -- Soma o ciclo contratado a partir da data de vencimento original:
        v_new_due := (v_client.due_date + (v_months || ' months')::interval)::DATE;

        -- Se o atraso foi superior ao período pago (ainda <= hoje), avança ciclo a ciclo:
        WHILE v_new_due <= v_today LOOP
          v_new_due := (v_new_due + interval '1 month')::DATE;
        END LOOP;

        IF v_months > 1 THEN
          v_new_due := (v_new_due + ((v_months - 1) || ' months')::interval)::DATE;
        END IF;
      END IF;
    ELSE
      -- Plano em dias avulsos
      IF v_client.due_date >= v_today THEN
        v_new_due := (v_client.due_date + (_days || ' days')::interval)::DATE;
      ELSE
        v_new_due := (v_today + (_days || ' days')::interval)::DATE;
      END IF;
    END IF;
  END IF;

  -- 4. Atualiza o vencimento e status do cliente
  UPDATE public.clients
  SET due_date = v_new_due,
      status = 'ativo',
      updated_at = now()
  WHERE id = _client_id;

  -- 5. Registra no histórico de pagamentos (se fornecido valor)
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

REVOKE ALL ON FUNCTION public.portal_finalize_client_renewal(UUID, INT, UUID, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_finalize_client_renewal(UUID, INT, UUID, INT, TEXT) TO anon, authenticated, service_role;
