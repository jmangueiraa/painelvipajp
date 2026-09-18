-- ==============================================================================
-- CADASTRO DO SUPERADMIN COMO USUÁRIO ÚNICO DO SISTEMA (SEM VERIFICAÇÃO DE EMAIL)
-- Email: entretenimentoajp@gmail.com
-- Senha: jesus33
-- Execute no Editor SQL do Supabase no projeto AJPVIP (zfafucaxbktpifydecng)
-- ==============================================================================

DO $$
DECLARE
  v_user_id UUID;
  v_existing_id UUID;
BEGIN
  -- 1. Garante extensão pgcrypto
  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  -- 2. Verifica se o email já existe em auth.users
  SELECT id INTO v_existing_id
  FROM auth.users
  WHERE lower(email) = 'entretenimentoajp@gmail.com';

  IF v_existing_id IS NOT NULL THEN
    v_user_id := v_existing_id;

    -- Atualiza senha para 'jesus33' e marca email como confirmado
    UPDATE auth.users
    SET encrypted_password = crypt('jesus33', gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        confirmation_sent_at = coalesce(confirmation_sent_at, now()),
        last_sign_in_at = now(),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
        raw_user_meta_data = '{"full_name":"Super Admin AJP"}'::jsonb,
        role = 'authenticated',
        aud = 'authenticated',
        banned_until = NULL,
        deleted_at = NULL,
        updated_at = now()
    WHERE id = v_user_id;
  ELSE
    v_user_id := gen_random_uuid();

    -- Insere novo usuário em auth.users com email pré-confirmado (dispensa confirmação)
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_sent_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      created_at,
      updated_at
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000'::uuid,
      v_user_id,
      'authenticated',
      'authenticated',
      'entretenimentoajp@gmail.com',
      crypt('jesus33', gen_salt('bf')),
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Super Admin AJP"}'::jsonb,
      false,
      now(),
      now()
    );
  END IF;

  -- 3. Vincula na tabela auth.identities para permitir login imediato por senha no Supabase GoTrue
  BEGIN
    DELETE FROM auth.identities 
    WHERE user_id = v_user_id 
       OR provider_id = v_user_id::text 
       OR (identity_data->>'email') = 'entretenimentoajp@gmail.com';

    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', 'entretenimentoajp@gmail.com', 'email_verified', true),
      'email',
      v_user_id::text,
      now(),
      now(),
      now()
    );
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO auth.identities (
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
      )
      VALUES (
        v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', 'entretenimentoajp@gmail.com', 'email_verified', true),
        'email',
        v_user_id::text,
        now(),
        now(),
        now()
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Aviso identity: %', SQLERRM;
    END;
  END;

  -- 4. Preserva e vincula a tabela settings (configurações do painel, Mercado Pago, Pix, etc)
  IF EXISTS (SELECT 1 FROM public.settings WHERE user_id = v_user_id) THEN
    -- Se já existe linha pro novo user_id, copia dados da linha antiga se estiverem vazios
    UPDATE public.settings s
    SET mp_access_token = coalesce(s.mp_access_token, o.mp_access_token),
        company_name = coalesce(s.company_name, o.company_name, 'AJP VIP'),
        pix_key = coalesce(s.pix_key, o.pix_key),
        pix_key_type = coalesce(s.pix_key_type, o.pix_key_type),
        pix_receiver = coalesce(s.pix_receiver, o.pix_receiver),
        pix_city = coalesce(s.pix_city, o.pix_city),
        default_renewal_days = coalesce(s.default_renewal_days, o.default_renewal_days, 30),
        referral_reward_days = coalesce(s.referral_reward_days, o.referral_reward_days, 7),
        referral_enabled = coalesce(s.referral_enabled, o.referral_enabled, true),
        app_android_url = coalesce(s.app_android_url, o.app_android_url),
        app_ios_url = coalesce(s.app_ios_url, o.app_ios_url),
        updates_movies_text = coalesce(s.updates_movies_text, o.updates_movies_text),
        updates_series_text = coalesce(s.updates_series_text, o.updates_series_text),
        updates_games_text = coalesce(s.updates_games_text, o.updates_games_text)
    FROM (SELECT * FROM public.settings WHERE user_id <> v_user_id LIMIT 1) o
    WHERE s.user_id = v_user_id;

    DELETE FROM public.settings WHERE user_id <> v_user_id;
  ELSE
    -- Se havia uma configuração com outro user_id, apenas atualiza a chave primária
    IF EXISTS (SELECT 1 FROM public.settings LIMIT 1) THEN
      UPDATE public.settings
      SET user_id = v_user_id
      WHERE user_id = (SELECT user_id FROM public.settings LIMIT 1);
      DELETE FROM public.settings WHERE user_id <> v_user_id;
    ELSE
      INSERT INTO public.settings (user_id, company_name)
      VALUES (v_user_id, 'AJP VIP');
    END IF;
  END IF;

  -- 5. Transfere a titularidade de todas as tabelas de dados para o Superadmin (EVITA perda de dados por CASCADE)
  UPDATE public.clients SET user_id = v_user_id WHERE user_id IS NULL OR user_id <> v_user_id;
  UPDATE public.plans SET user_id = v_user_id WHERE user_id IS NULL OR user_id <> v_user_id;
  UPDATE public.servers SET user_id = v_user_id WHERE user_id IS NULL OR user_id <> v_user_id;
  UPDATE public.charges SET user_id = v_user_id WHERE user_id IS NULL OR user_id <> v_user_id;
  UPDATE public.payments SET user_id = v_user_id WHERE user_id IS NULL OR user_id <> v_user_id;
  UPDATE public.renewal_requests SET user_id = v_user_id WHERE user_id IS NULL OR user_id <> v_user_id;
  UPDATE public.content_updates SET user_id = v_user_id WHERE user_id IS NULL OR user_id <> v_user_id;

  BEGIN
    UPDATE public.app_plans SET user_id = v_user_id WHERE user_id IS NULL OR user_id <> v_user_id;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    UPDATE public.app_renewal_requests SET user_id = v_user_id WHERE user_id IS NULL OR user_id <> v_user_id;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    -- Evita conflito em app_subscriptions.UNIQUE(user_id)
    IF EXISTS (SELECT 1 FROM public.app_subscriptions WHERE user_id = v_user_id) THEN
      DELETE FROM public.app_subscriptions WHERE user_id <> v_user_id;
    ELSE
      UPDATE public.app_subscriptions SET user_id = v_user_id WHERE user_id <> v_user_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    UPDATE public.app_subscription_payments SET user_id = v_user_id WHERE user_id IS NULL OR user_id <> v_user_id;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    UPDATE public.lead_contacts SET created_by = v_user_id WHERE created_by <> v_user_id;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    -- Evita conflito em store_products.UNIQUE(user_id, key)
    -- Se haviam produtos criados por outro usuário, remove os produtos padrão recém-gerados do superadmin e migra os existentes
    IF EXISTS (SELECT 1 FROM public.store_products WHERE user_id <> v_user_id) THEN
      DELETE FROM public.store_products WHERE user_id = v_user_id;
      UPDATE public.store_products SET user_id = v_user_id WHERE user_id <> v_user_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    UPDATE public.store_purchases SET user_id = v_user_id WHERE user_id <> v_user_id;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    -- Evita conflito em store_buyers.UNIQUE(user_id, auth_user_id)
    DELETE FROM public.store_buyers
    WHERE user_id <> v_user_id
      AND auth_user_id IN (SELECT auth_user_id FROM public.store_buyers WHERE user_id = v_user_id);
    UPDATE public.store_buyers SET user_id = v_user_id WHERE user_id <> v_user_id;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    UPDATE public.push_notifications_log SET user_id = v_user_id WHERE user_id IS NULL OR user_id <> v_user_id;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    UPDATE public.push_tokens SET user_id = v_user_id WHERE user_id IS NULL OR user_id <> v_user_id;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- 6. Configura o Perfil do Superadmin
  DELETE FROM public.profiles WHERE id <> v_user_id;
  INSERT INTO public.profiles (id, full_name, company_name)
  VALUES (v_user_id, 'Super Admin AJP', 'AJP VIP')
  ON CONFLICT (id) DO UPDATE SET full_name = 'Super Admin AJP', company_name = 'AJP VIP';

  -- 7. Define a role de 'admin' em public.user_roles (garante acesso total ao useIsAdmin)
  DELETE FROM public.user_roles WHERE user_id <> v_user_id;
  DELETE FROM public.user_roles WHERE user_id = v_user_id AND role <> 'admin';
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'admin')
  ON CONFLICT DO NOTHING;

  -- 8. Remove quaisquer outros usuários de auth (tornando entretenimentoajp@gmail.com o ÚNICO usuário)
  BEGIN DELETE FROM auth.mfa_factors WHERE user_id <> v_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM auth.refresh_tokens WHERE session_id IN (SELECT id FROM auth.sessions WHERE user_id <> v_user_id); EXCEPTION WHEN OTHERS THEN NULL; END;
  DELETE FROM auth.identities WHERE user_id <> v_user_id;
  DELETE FROM auth.sessions WHERE user_id <> v_user_id;
  DELETE FROM auth.users WHERE id <> v_user_id;

  RAISE NOTICE 'Superadmin entretenimentoajp@gmail.com configurado como usuário único do sistema com sucesso! (ID: %)', v_user_id;
END $$;
