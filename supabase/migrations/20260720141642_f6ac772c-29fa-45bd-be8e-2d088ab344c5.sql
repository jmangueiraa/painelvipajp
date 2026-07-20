DO $test$
DECLARE
  v_user_id uuid;
  v_test_id uuid;
BEGIN
  SELECT user_id INTO v_user_id FROM public.settings LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum usuário disponível para o teste';
  END IF;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  INSERT INTO public.push_notifications_log (
    user_id, title, body, audience, target_client_ids, scheduled_at, status
  ) VALUES (
    v_user_id,
    'Teste técnico de agendamento',
    'Validação automática sem envio',
    'all',
    ARRAY[]::uuid[],
    now() + interval '1 hour',
    'scheduled'
  ) RETURNING id INTO v_test_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.push_notifications_log
    WHERE id = v_test_id AND user_id = v_user_id AND status = 'scheduled'
  ) THEN
    RAISE EXCEPTION 'O agendamento não pôde ser lido após a criação';
  END IF;

  DELETE FROM public.push_notifications_log WHERE id = v_test_id;
  EXECUTE 'RESET ROLE';
END
$test$;