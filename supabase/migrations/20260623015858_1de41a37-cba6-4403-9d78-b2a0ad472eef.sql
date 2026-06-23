ALTER TABLE public.settings ALTER COLUMN referral_reward_days SET DEFAULT 30;

CREATE OR REPLACE FUNCTION public.apply_referral_bonus()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT COUNT(*) INTO v_paid_count FROM public.payments WHERE client_id = NEW.client_id;
  IF v_paid_count <> 1 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_referrer FROM public.clients WHERE id = v_client.referred_by;
  IF v_referrer.id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_settings FROM public.settings WHERE user_id = v_referrer.user_id;
  IF v_settings.referral_enabled IS DISTINCT FROM TRUE THEN RETURN NEW; END IF;

  UPDATE public.clients
  SET bonus_days = bonus_days + COALESCE(v_settings.referral_reward_days, 30),
      due_date = due_date + COALESCE(v_settings.referral_reward_days, 30)
  WHERE id = v_referrer.id;

  RETURN NEW;
END;
$function$;